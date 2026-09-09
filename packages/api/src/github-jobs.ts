import {
  createAgentProposal,
  createPullRequestReview,
  createReleaseReadiness,
  createWorkflowRun,
  getActiveReadinessForSha,
  getActiveReviewForSha,
  getBillingUsage,
  getLatestReviewForFeature,
  getPullRequest,
  incrementAiReviewCreditsUsed,
} from "@throughline/db";
import { inngest, EVENTS } from "./inngest";

/**
 * Circuit breaker for the AI fix loop: the most completed review rounds a feature
 * may auto-generate a fix plan for. Once a feature has had this many completed
 * reviews and is still blocking, the reviewer/agent loop has failed to converge —
 * the review workflow stops spinning up new AI fix plans and the feature waits in
 * `fix-needed` for a human to take over, rather than looping forever.
 */
export const MAX_FIX_ROUNDS = 3;

/**
 * Generate a remediation plan from a completed review's blocking findings: a
 * progress run keyed on the feature, then the fix-tasks workflow. Fired by the
 * review workflow when a run lands with blocking findings. The handler is
 * idempotent per review run (keyed on `reviewId`), so a redelivered review or a
 * repeat call won't double-generate tasks.
 */
export async function startFixTaskGeneration(
  workspaceId: string,
  featureRequestId: string,
  reviewId: string,
) {
  const run = await createWorkflowRun(workspaceId, {
    entityId: featureRequestId,
    entityType: "feature_request",
    functionName: "generate-fix-tasks",
  });
  await inngest.send({
    name: EVENTS.fixTasksRequested,
    data: { workspaceId, featureRequestId, reviewId, workflowRunId: run.id },
  });
  return run;
}

/**
 * Kick off a background fetch of a pull request's changed files + diff. The run
 * is keyed on the PR id so the PR detail view can surface its progress via the
 * existing per-entity workflow_run UI. The handler is idempotent — re-running
 * for a headSha already snapshotted is a no-op — so callers (the webhook on new
 * commits, or an on-demand refresh) can fire freely.
 */
export async function startPrDiffFetch(
  workspaceId: string,
  pullRequestId: string,
) {
  const run = await createWorkflowRun(workspaceId, {
    entityId: pullRequestId,
    entityType: "pull_request",
    functionName: "fetch-pr-diff",
  });
  await inngest.send({
    name: EVENTS.prDiffRequested,
    data: { workspaceId, pullRequestId, workflowRunId: run.id },
  });
  return run;
}

/**
 * Start an AI QA review of a pull request. Idempotent per commit: if a
 * pending/running/completed review already exists for the PR's current
 * `headSha`, it returns that one instead of starting a second — so a redelivered
 * webhook, a manual link, and the "Run review" button can all fire without
 * spamming duplicate reviews. Only fires for a PR that is linked to a feature.
 * The run is keyed on the feature so its progress surfaces in the request
 * header alongside the other phases.
 */
export async function startPullRequestReview(
  workspaceId: string,
  pullRequestId: string,
) {
  const pr = await getPullRequest(workspaceId, pullRequestId);
  if (!pr || !pr.featureRequestId) return null;

  const existing = await getActiveReviewForSha(
    workspaceId,
    pullRequestId,
    pr.headSha,
  );
  if (existing) return existing;

  // Enforce + consume an AI review credit for a genuinely new run only — the
  // idempotent re-entry above never charges. Out of credits: skip rather than
  // run the (paid) review; the tRPC entrypoint surfaces the upgrade message, and
  // the webhook path simply doesn't re-review until the workspace upgrades.
  const usage = await getBillingUsage(workspaceId);
  if (usage.aiReviewCredits.remaining <= 0) return null;

  const review = await createPullRequestReview(workspaceId, {
    pullRequestId,
    featureRequestId: pr.featureRequestId,
    headSha: pr.headSha,
  });
  await incrementAiReviewCreditsUsed(workspaceId);
  const run = await createWorkflowRun(workspaceId, {
    entityId: pr.featureRequestId,
    entityType: "feature_request",
    functionName: "review-pull-request",
  });
  await inngest.send({
    name: EVENTS.prReviewRequested,
    data: { workspaceId, pullRequestId, reviewId: review.id, workflowRunId: run.id },
  });
  return review;
}

/**
 * Start an AI release-readiness assessment for a feature. Grounded in
 * the latest AI review, so it only fires once a review exists — the assessment
 * weighs the PRD + review history + outstanding findings into a ship/no-ship
 * verdict. Idempotent per feature + reviewed commit: a pending/running/completed
 * assessment for the same review head is returned instead of starting a second,
 * so the auto-trigger (on reaching awaiting-approval) and the cockpit re-run
 * button can both fire freely; a failed run is re-runnable. The run is keyed on
 * the feature so its progress surfaces in the request header. Returns null if
 * there's no review to ground the assessment in.
 */
export async function startReleaseReadinessCheck(
  workspaceId: string,
  featureRequestId: string,
) {
  const review = await getLatestReviewForFeature(workspaceId, featureRequestId);
  if (!review) return null;

  const existing = await getActiveReadinessForSha(
    workspaceId,
    featureRequestId,
    review.headSha,
  );
  if (existing) return existing;

  const readiness = await createReleaseReadiness(workspaceId, {
    featureRequestId,
    headSha: review.headSha,
  });
  const run = await createWorkflowRun(workspaceId, {
    entityId: featureRequestId,
    entityType: "feature_request",
    functionName: "release-readiness",
  });
  await inngest.send({
    name: EVENTS.releaseReadinessRequested,
    data: {
      workspaceId,
      featureRequestId,
      readinessId: readiness.id,
      workflowRunId: run.id,
    },
  });
  return readiness;
}

/**
 * Start a coding-agent run for a feature: create the proposal (in the generating
 * state) and a progress run, then fire the workflow. Returns the proposal so the
 * caller can point the review UI at it. `feedback` carries reviewer notes into a
 * regenerate.
 */
export async function startAgentCodegen(
  workspaceId: string,
  featureRequestId: string,
  feedback?: string,
) {
  const proposal = await createAgentProposal(workspaceId, featureRequestId);
  const run = await createWorkflowRun(workspaceId, {
    entityId: featureRequestId,
    entityType: "feature_request",
    functionName: "generate-code",
  });
  await inngest.send({
    name: EVENTS.agentCodegenRequested,
    data: {
      workspaceId,
      featureRequestId,
      proposalId: proposal.id,
      workflowRunId: run.id,
      feedback,
    },
  });
  return proposal;
}
