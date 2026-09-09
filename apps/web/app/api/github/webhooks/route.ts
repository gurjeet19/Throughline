import { NextResponse } from "next/server";
import {
  advanceFeatureToReview,
  getFeatureByDevelopmentBranch,
  getRepositoryByGithubIds,
  setPullRequestFeature,
  upsertPullRequest,
} from "@throughline/db";
import { startPrDiffFetch, startPullRequestReview } from "@throughline/api";
import {
  verifyWebhookSignature,
  type PullRequestEvent,
} from "@throughline/github";

/**
 * GitHub App webhook receiver. Every delivery's HMAC signature is verified
 * against `GITHUB_WEBHOOK_SECRET` (via `@octokit/webhooks`) over the *raw* body
 * before anything is parsed — unverified or malformed deliveries are rejected.
 *
 * We map a delivery to its owning workspace/repository server-side, from the
 * `installation.id` + `repository.id` on the payload (never client input), and
 * upsert `pull_request` rows for connected repos. The upsert is keyed on
 * (repositoryId, number) and order-tolerant, so GitHub's redelivered or
 * out-of-order events stay idempotent.
 *
 *   POST /api/github/webhooks
 */
export async function POST(req: Request) {
  // Raw body is required for signature verification — re-serializing changes
  // the bytes and invalidates the HMAC.
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  const valid = await verifyWebhookSignature(raw, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // Only pull_request events drive state here; ack everything else so GitHub
  // doesn't retry deliveries we intentionally ignore.
  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: event }, { status: 202 });
  }

  const result = await handlePullRequest(payload as PullRequestEvent);
  return NextResponse.json(result.body, { status: result.status });
}

const TRACKED_ACTIONS = new Set([
  "opened",
  "synchronize",
  "edited",
  "reopened",
  "closed",
]);

async function handlePullRequest(event: PullRequestEvent) {
  const installationId = event.installation?.id;
  const repoId = event.repository?.id;
  if (!installationId || !repoId) {
    return { status: 400, body: { error: "Missing installation or repository" } };
  }

  // Trusted mapping: resolve the connected repo (and its workspace) from the
  // installation + repo id. An event for a repo we don't track is a no-op.
  const repo = await getRepositoryByGithubIds(
    String(installationId),
    String(repoId),
  );
  if (!repo) {
    return { status: 202, body: { ok: true, untracked: true } };
  }

  if (!TRACKED_ACTIONS.has(event.action)) {
    return { status: 202, body: { ok: true, ignoredAction: event.action } };
  }

  const pr = event.pull_request;
  const branch = pr.head.ref;
  const saved = await upsertPullRequest(repo.workspaceId, repo.id, {
    number: pr.number,
    title: pr.title ?? "",
    state: pr.state,
    merged: Boolean(pr.merged),
    branch,
    headSha: pr.head.sha,
    htmlUrl: pr.html_url,
    authorLogin: pr.user?.login ?? null,
    githubCreatedAt: pr.created_at ? new Date(pr.created_at) : null,
    githubUpdatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
  });

  // A PR opened on `throughline/<feature-id>` auto-links to its feature and
  // advances it in-development → in-review. Matched on the feature's recorded
  // branch, never client input. Guarded transitions make this safe under
  // duplicate/redelivered events.
  let linkedFeatureId: string | null = null;
  if (saved && !saved.featureRequestId && branch.startsWith("throughline/")) {
    const feature = await getFeatureByDevelopmentBranch(
      repo.workspaceId,
      repo.id,
      branch,
    );
    if (feature) {
      await setPullRequestFeature(repo.workspaceId, saved.id, feature.id);
      await advanceFeatureToReview(repo.workspaceId, feature.id);
      linkedFeatureId = feature.id;
    }
  }

  // New commits (or a (re)opened PR) change the diff; fetch a fresh snapshot and
  // run an AI review of the updated code in the background. Both are idempotent
  // on the PR's current head, so a redelivered or out-of-order event is a no-op,
  // while a genuinely new commit (a pushed fix) re-fetches and starts a fresh
  // review run — the re-review loop. `startPullRequestReview` no-ops for a PR
  // not linked to a feature.
  if (saved && ["opened", "synchronize", "reopened"].includes(event.action)) {
    await startPrDiffFetch(repo.workspaceId, saved.id);
    await startPullRequestReview(repo.workspaceId, saved.id);
  }

  return { status: 200, body: { ok: true, linkedFeatureId } };
}
