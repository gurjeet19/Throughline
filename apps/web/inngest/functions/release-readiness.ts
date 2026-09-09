import {
  getLatestPrdForRequest,
  getReleaseReadiness,
  listReviewsForFeature,
  updateReleaseReadiness,
  updateWorkflowRun,
} from "@throughline/db";
import { assessReleaseReadiness, models } from "@throughline/ai";
import { EVENTS } from "@throughline/api";
import { inngest } from "../client";

/**
 * Release-readiness AI check. When a feature reaches `awaiting-approval`
 * (or on a cockpit re-run), assess whether it is ready to ship — grounded in the
 * PRD, the AI review history, and the outstanding (non-blocking) findings — and
 * persist a structured ready/not-ready verdict the cockpit surfaces as its
 * headline summary.
 *
 *   load PRD + review history (must have a PRD + a review) → assess readiness
 *            └ persist verdict (ready, rationale, risks) on the assessment row
 *
 * Keyed on the feature so the per-request progress UI shows the run. The trigger
 * is idempotent per feature + reviewed commit, so a redelivered event resolves to
 * the same assessment row rather than a duplicate.
 */
export const releaseReadinessFunction = inngest.createFunction(
  { id: "release-readiness", triggers: [{ event: EVENTS.releaseReadinessRequested }] },
  async ({ event, step }) => {
    const { workspaceId, featureRequestId, readinessId, workflowRunId } =
      event.data as {
        workspaceId: string;
        featureRequestId: string;
        readinessId: string;
        workflowRunId: string;
      };

    const fail = async (message: string) => {
      await updateReleaseReadiness(readinessId, { status: "failed", error: message });
      await updateWorkflowRun(workflowRunId, {
        status: "failed",
        currentStep: message,
      });
    };

    const context = await step.run("gather-context", async () => {
      await updateReleaseReadiness(readinessId, { status: "running" });
      await updateWorkflowRun(workflowRunId, {
        status: "running",
        currentStep: "Reading the PRD and AI review history",
      });
      const readiness = await getReleaseReadiness(workspaceId, readinessId);
      const prd = await getLatestPrdForRequest(workspaceId, featureRequestId);
      // Newest first: the latest run is the current verdict; earlier runs are the
      // fix-loop trail. Its non-blocking findings are the outstanding concerns.
      const reviews = await listReviewsForFeature(workspaceId, featureRequestId);
      return { readiness, prd, reviews };
    });

    if (!context.readiness) return { outcome: "missing-assessment" };
    if (!context.prd || context.reviews.length === 0) {
      await fail("PRD or AI review is unavailable for the readiness check");
      return { outcome: "not-ready-to-assess" };
    }

    const { prd, reviews } = context;
    const latest = reviews[0];
    const outstandingFindings = latest.findings.filter(
      (f) => f.severity === "non-blocking",
    );

    const verdict = await step.run("assess", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Assessing release readiness",
      });
      return assessReleaseReadiness({
        prd: {
          problemStatement: prd.problemStatement,
          goals: prd.goals,
          nonGoals: prd.nonGoals,
          userStories: prd.userStories,
          acceptanceCriteria: prd.acceptanceCriteria,
          edgeCases: prd.edgeCases,
          successMetrics: prd.successMetrics,
        },
        reviews: reviews.map((r) => ({
          summary: r.summary,
          blockingCount: r.blockingCount,
          nonBlockingCount: r.nonBlockingCount,
        })),
        outstandingFindings,
      });
    });

    await step.run("persist", async () => {
      await updateReleaseReadiness(readinessId, {
        status: "completed",
        model: models.releaseReadiness,
        ready: verdict.ready,
        rationale: verdict.rationale,
        risks: verdict.risks,
      });
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Readiness check complete",
      });
    });

    return { outcome: "assessed", ready: verdict.ready };
  },
);
