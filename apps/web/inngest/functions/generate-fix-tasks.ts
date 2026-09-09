import {
  createTask,
  getLatestPrdForRequest,
  getMaxTaskSeqForFeature,
  getPullRequestReview,
  listTasksByFeatureRequest,
  listTasksByReview,
  updateWorkflowRun,
} from "@throughline/db";
import { generateFixTasks } from "@throughline/ai";
import { EVENTS } from "@throughline/api";
import { inngest } from "../client";

/**
 * The fix loop: when a review lands with blocking findings, turn them into a
 * remediation plan — fix tasks that land on the feature's existing Kanban board
 * (in `todo`) and group on the Fixes Plan tab, just as the PRD's plan tasks do.
 *
 *   load review (must be completed + blocking) ─ already has fix tasks? → stop
 *            └ read PRD + blocking findings → generate fix tasks → persist as
 *              `kind: 'fix'` tasks, numbered after the plan's existing seqs
 *
 * Keyed on the feature so the per-request progress UI shows the run; idempotent
 * on `reviewId` so a redelivered review event can't double-generate.
 */
export const generateFixTasksFunction = inngest.createFunction(
  { id: "generate-fix-tasks", triggers: [{ event: EVENTS.fixTasksRequested }] },
  async ({ event, step }) => {
    const { workspaceId, featureRequestId, reviewId, workflowRunId } =
      event.data as {
        workspaceId: string;
        featureRequestId: string;
        reviewId: string;
        workflowRunId: string;
      };

    const context = await step.run("load-context", async () => {
      await updateWorkflowRun(workflowRunId, {
        status: "running",
        currentStep: "Reading the review's blocking findings",
      });
      const review = await getPullRequestReview(workspaceId, reviewId);
      const existing = await listTasksByReview(workspaceId, reviewId);
      const prd = await getLatestPrdForRequest(workspaceId, featureRequestId);
      return { review, existing, prd };
    });

    // Idempotency: a fix plan for this exact review already exists — stop.
    if (context.existing.length > 0) {
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Fix plan ready",
      });
      return { outcome: "already-planned", count: context.existing.length };
    }

    const blocking = (context.review?.findings ?? []).filter(
      (f) => f.severity === "blocking",
    );

    // Nothing to remediate (no blocking findings, or the review/PRD vanished) —
    // succeed quietly rather than leaving a stuck run.
    if (
      !context.review ||
      context.review.status !== "completed" ||
      !context.prd ||
      blocking.length === 0
    ) {
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "No blocking findings to plan",
      });
      return { outcome: "nothing-to-plan" };
    }

    const { prd } = context;

    const generated = await step.run("generate-fix-tasks", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Turning blocking findings into fix tasks",
      });
      return generateFixTasks({
        prd: {
          problemStatement: prd.problemStatement,
          goals: prd.goals,
          nonGoals: prd.nonGoals,
          userStories: prd.userStories,
          acceptanceCriteria: prd.acceptanceCriteria,
          edgeCases: prd.edgeCases,
          successMetrics: prd.successMetrics,
        },
        findings: blocking,
      });
    });

    await step.run("persist-fix-tasks", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Adding fix tasks to the board",
      });

      // Land each fix task at the end of the todo column, numbered after the
      // plan's current max seq so #numbers stay stable and non-colliding.
      const todoCount = (
        await listTasksByFeatureRequest(workspaceId, featureRequestId)
      ).filter((t) => t.status === "todo").length;
      const baseSeq = await getMaxTaskSeqForFeature(workspaceId, featureRequestId);

      for (let i = 0; i < generated.length; i++) {
        const t = generated[i];
        await createTask(workspaceId, {
          prdId: prd.id,
          featureRequestId,
          title: t.title,
          description: t.description,
          requirementRefs: t.requirementRefs,
          status: "todo",
          orderIndex: todoCount + i,
          seq: baseSeq + 1 + i,
          kind: "fix",
          reviewId,
        });
      }

      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Fix plan ready",
      });
    });

    return { outcome: "planned", count: generated.length };
  },
);
