import {
  applyReviewGateToFeature,
  countCompletedReviewsForFeature,
  getFeatureRequest,
  getGithubInstallation,
  getLatestPrdForRequest,
  getPreviousCompletedReviewForFeature,
  getPullRequest,
  getPullRequestDiff,
  getPullRequestReview,
  getRepository,
  listTasksByFeatureRequest,
  updatePullRequestReview,
  updateWorkflowRun,
  upsertPullRequestDiff,
  type DiffFile,
  type ReviewFinding,
} from "@throughline/db";
import {
  getPullRequestDiff as fetchDiff,
  listPullRequestFiles,
} from "@throughline/github";
import { models, reviewPullRequest, type ReviewDiffFile } from "@throughline/ai";
import {
  EVENTS,
  MAX_FIX_ROUNDS,
  postReviewToGithub,
  startFixTaskGeneration,
  startReleaseReadinessCheck,
} from "@throughline/api";
import { inngest } from "../client";

// Storage cap on the snapshot (mirrors fetch-pr-diff) and a tighter cap on the
// slice handed to the model — beyond it the review works from a reduced view and
// says so, rather than silently dropping the tail.
const MAX_DIFF_BYTES = 600_000;
const MAX_MODEL_DIFF_CHARS = 100_000;

/**
 * AI QA review of a pull request. Reads the feature's PRD, tasks, and
 * the PR's diff, then evaluates the change across the seven review dimensions,
 * classifying each finding blocking / non-blocking. The run is self-sufficient:
 * if the diff snapshot is missing or stale it fetches one itself, so the review
 * never depends on another workflow's timing. Grounded entirely in the real
 * diff — nothing hardcoded. Progress is visible via `workflow_run` (keyed on the
 * feature) and the review row's own status.
 */
export const reviewPullRequestFunction = inngest.createFunction(
  { id: "review-pull-request", triggers: [{ event: EVENTS.prReviewRequested }] },
  async ({ event, step }) => {
    const { workspaceId, pullRequestId, reviewId, workflowRunId } =
      event.data as {
        workspaceId: string;
        pullRequestId: string;
        reviewId: string;
        workflowRunId: string;
      };

    const fail = async (message: string) => {
      await updatePullRequestReview(reviewId, { status: "failed", error: message });
      await updateWorkflowRun(workflowRunId, {
        status: "failed",
        currentStep: message,
      });
    };

    const context = await step.run("gather-context", async () => {
      await updatePullRequestReview(reviewId, { status: "running" });
      await updateWorkflowRun(workflowRunId, {
        status: "running",
        currentStep: "Reading the PRD, tasks, and pull request",
      });
      const review = await getPullRequestReview(workspaceId, reviewId);
      const pr = await getPullRequest(workspaceId, pullRequestId);
      const feature = pr?.featureRequestId
        ? await getFeatureRequest(workspaceId, pr.featureRequestId)
        : null;
      const prd = feature
        ? await getLatestPrdForRequest(workspaceId, feature.id)
        : null;
      const tasks = feature
        ? await listTasksByFeatureRequest(workspaceId, feature.id)
        : [];
      const repo = pr ? await getRepository(workspaceId, pr.repositoryId) : null;
      const installation = await getGithubInstallation(workspaceId);
      const snapshot = await getPullRequestDiff(workspaceId, pullRequestId);
      // The prior round's verdict, if any — grounds this re-review so it checks
      // whether earlier blockers were fixed rather than judging the diff cold.
      const priorReview = pr?.featureRequestId
        ? await getPreviousCompletedReviewForFeature(
            workspaceId,
            pr.featureRequestId,
            reviewId,
          )
        : null;
      return {
        review,
        pr,
        feature,
        prd,
        tasks,
        repo,
        installation,
        snapshot,
        priorReview,
      };
    });

    if (!context.review || !context.pr || !context.feature || !context.prd) {
      await fail("Pull request, feature, or PRD is unavailable");
      return { outcome: "not-ready" };
    }

    const { pr, feature, prd, tasks, repo, installation } = context;

    // Ensure a diff snapshot current for the commit under review. Fetch it
    // ourselves if it's missing or lags the PR head, so the review doesn't race
    // the diff-fetch workflow.
    const snapshot = await step.run("ensure-diff", async () => {
      const existing = context.snapshot;
      if (existing && existing.headSha === pr.headSha) return existing;
      if (!repo || !installation) return existing ?? null;

      await updateWorkflowRun(workflowRunId, {
        currentStep: "Fetching the changed files and diff",
      });
      const installationId = Number(installation.installationId);
      const files = await listPullRequestFiles(
        installationId,
        repo.owner,
        repo.name,
        pr.number,
      );
      const fullDiff = await fetchDiff(
        installationId,
        repo.owner,
        repo.name,
        pr.number,
      );
      const truncated = Buffer.byteLength(fullDiff, "utf8") > MAX_DIFF_BYTES;
      const diff = truncated ? fullDiff.slice(0, MAX_DIFF_BYTES) : fullDiff;
      const additions = files.reduce((n, f) => n + f.additions, 0);
      const deletions = files.reduce((n, f) => n + f.deletions, 0);
      return upsertPullRequestDiff(workspaceId, pullRequestId, {
        headSha: pr.headSha,
        files,
        additions,
        deletions,
        diff,
        truncated,
      });
    });

    if (!snapshot) {
      await fail("No diff available to review");
      return { outcome: "no-diff" };
    }

    const generated = await step.run("review", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Reviewing the code against the requirements",
      });
      const diffText =
        snapshot.diff.length > MAX_MODEL_DIFF_CHARS
          ? snapshot.diff.slice(0, MAX_MODEL_DIFF_CHARS)
          : snapshot.diff;
      const truncated =
        snapshot.truncated || snapshot.diff.length > MAX_MODEL_DIFF_CHARS;
      const files: ReviewDiffFile[] = (snapshot.files as DiffFile[]).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }));
      const result = await reviewPullRequest({
        prd: {
          problemStatement: prd.problemStatement,
          goals: prd.goals,
          nonGoals: prd.nonGoals,
          userStories: prd.userStories,
          acceptanceCriteria: prd.acceptanceCriteria,
          edgeCases: prd.edgeCases,
          successMetrics: prd.successMetrics,
        },
        tasks: tasks.map((t) => ({
          seq: t.seq,
          title: t.title,
          description: t.description,
          requirementRefs: t.requirementRefs,
        })),
        files,
        diff: diffText,
        truncated,
        priorFindings: context.priorReview?.findings ?? undefined,
      });
      return { result, truncated };
    });

    await step.run("persist-review", async () => {
      const findings: ReviewFinding[] = generated.result.findings.map((f) => ({
        dimension: f.dimension,
        severity: f.severity,
        title: f.title,
        explanation: f.explanation,
        recommendation: f.recommendation,
        file: f.file,
        line: f.line,
      }));
      const blockingCount = findings.filter((f) => f.severity === "blocking").length;
      await updatePullRequestReview(reviewId, {
        status: "completed",
        model: models.review,
        summary: generated.result.summary,
        findings,
        blockingCount,
        nonBlockingCount: findings.length - blockingCount,
        truncated: generated.truncated,
      });
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Review complete",
      });
    });

    // Gate the feature on the review outcome: blocking findings send it to
    // fix-needed, a clean review to awaiting-approval. Guarded + re-reading the
    // latest review, so it's safe under concurrent completions.
    const gated = await step.run("apply-gate", async () => {
      return applyReviewGateToFeature(workspaceId, feature.id);
    });

    // A clean review puts the feature up for approval — kick off the AI
    // release-readiness assessment that headlines the cockpit. Idempotent per
    // feature + reviewed commit, so a redelivered completion won't duplicate it.
    if (gated?.status === "awaiting-approval") {
      await step.run("start-readiness", async () => {
        await startReleaseReadinessCheck(workspaceId, feature.id);
      });
    }

    // Blocking findings → turn them into a remediation plan (fix tasks on the
    // board / Fixes Plan tab), mirroring how an approved PRD becomes tasks. The
    // generator is idempotent on this review id, so a redelivery is a no-op.
    //
    // Circuit breaker: only auto-plan fixes while under the round cap. Once a
    // feature has hit MAX_FIX_ROUNDS completed reviews and is still blocking, the
    // reviewer/agent loop has failed to converge — stop spinning up new AI fix
    // plans and leave it in `fix-needed` for a human to take over, rather than
    // generating fresh fixes forever.
    const blockingCount = generated.result.findings.filter(
      (f) => f.severity === "blocking",
    ).length;
    if (blockingCount > 0) {
      const rounds = await step.run("count-rounds", async () =>
        countCompletedReviewsForFeature(workspaceId, feature.id),
      );
      if (rounds < MAX_FIX_ROUNDS) {
        await step.run("plan-fixes", async () => {
          await startFixTaskGeneration(workspaceId, feature.id, reviewId);
        });
      } else {
        await step.run("fix-loop-capped", async () => {
          await updateWorkflowRun(workflowRunId, {
            currentStep: `Auto-fix stopped after ${rounds} review rounds — needs a human`,
          });
        });
      }
    }

    // Post the review back onto the GitHub PR. A posting failure is recorded on
    // the review (postError) and surfaced for retry in-app — it must not fail
    // the workflow or undo the completed review, so it's swallowed here.
    await step.run("post-to-github", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Posting the review to GitHub",
      });
      try {
        await postReviewToGithub(workspaceId, reviewId);
      } catch {
        // postError already recorded; nothing more to do.
      }
      await updateWorkflowRun(workflowRunId, { currentStep: "Review complete" });
    });

    return { outcome: "reviewed", findings: generated.result.findings.length };
  },
);
