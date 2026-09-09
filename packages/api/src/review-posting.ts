import {
  getGithubInstallation,
  getPullRequest,
  getPullRequestReview,
  getRepository,
  updatePullRequestReview,
  type ReviewFinding,
} from "@throughline/db";
import {
  postPullRequestReview,
  type ReviewInlineComment,
} from "@throughline/github";

const DIMENSION_LABELS: Record<string, string> = {
  requirements: "Requirements",
  "acceptance-criteria": "Acceptance criteria",
  tasks: "Tasks",
  security: "Security",
  performance: "Performance",
  "edge-cases": "Edge cases",
  "code-quality": "Code quality",
};

type ReviewRow = {
  headSha: string;
  summary: string;
  blockingCount: number;
  nonBlockingCount: number;
  findings: ReviewFinding[];
  truncated: boolean;
};

/** A finding is inline-able only when it names both a file and a line. */
function isAnchored(f: ReviewFinding): f is ReviewFinding & { line: number } {
  return Boolean(f.file) && typeof f.line === "number";
}

function dim(d: string): string {
  return DIMENSION_LABELS[d] ?? d;
}

function sev(s: string): string {
  return s === "blocking" ? "🔴 Blocking" : "🟡 Non-blocking";
}

/**
 * Render the review into a GitHub PR review: a markdown summary body plus inline
 * comments for anchored findings. Unanchored findings (no file/line) are listed
 * in the body so nothing is lost.
 */
function buildReviewPost(review: ReviewRow): {
  body: string;
  comments: ReviewInlineComment[];
} {
  const anchored = review.findings.filter(isAnchored);
  const unanchored = review.findings.filter((f) => !isAnchored(f));
  const clear = review.blockingCount === 0;

  const lines: string[] = [
    "## Throughline AI review",
    "",
    `${clear ? "🟢" : "🔴"} **${
      clear ? "No blocking issues" : `${review.blockingCount} blocking issue${
        review.blockingCount === 1 ? "" : "s"
      }`
    }** — ${review.blockingCount} blocking · ${review.nonBlockingCount} non-blocking`,
    "",
    review.summary,
  ];

  if (review.truncated) {
    lines.push(
      "",
      "> ⚠️ The diff was large — this review worked from a reduced view of the changes.",
    );
  }

  if (unanchored.length > 0) {
    lines.push("", "### Findings");
    for (const f of unanchored) {
      lines.push(
        "",
        `- **${sev(f.severity)} · ${dim(f.dimension)}** — ${f.title}`,
        `  ${f.explanation}`,
        `  _Fix:_ ${f.recommendation}`,
      );
    }
  }

  lines.push(
    "",
    "---",
    `🤖 Posted by Throughline · reviewed \`${review.headSha.slice(0, 7)}\``,
  );

  const comments: ReviewInlineComment[] = anchored.map((f) => ({
    path: f.file as string,
    line: f.line,
    body: `**${sev(f.severity)} · ${dim(f.dimension)}** — ${f.title}\n\n${f.explanation}\n\n**Fix:** ${f.recommendation}`,
  }));

  return { body: lines.join("\n"), comments };
}

export type PostReviewResult =
  | { status: "posted"; url: string }
  | { status: "skipped"; reason: string };

/**
 * Post a completed review back to its pull request. Idempotent
 * per review run: a run already posted (`postedAt` set) is a no-op, so webhook
 * redeliveries or repeat runs can't double-post. Uses the per-installation
 * token, workspace-scoped throughout. On failure it records `postError` (the
 * stored review is never corrupted) and rethrows so the caller can decide
 * whether to surface it (retry mutation) or swallow it (the review workflow).
 */
export async function postReviewToGithub(
  workspaceId: string,
  reviewId: string,
): Promise<PostReviewResult> {
  const review = await getPullRequestReview(workspaceId, reviewId);
  if (!review || review.status !== "completed") {
    return { status: "skipped", reason: "not-ready" };
  }
  if (review.postedAt) {
    return { status: "skipped", reason: "already-posted" };
  }

  const pr = await getPullRequest(workspaceId, review.pullRequestId);
  const repo = pr ? await getRepository(workspaceId, pr.repositoryId) : null;
  const installation = await getGithubInstallation(workspaceId);
  if (!pr || !repo || !installation) {
    await updatePullRequestReview(reviewId, {
      postError: "Repository or installation unavailable for posting.",
    });
    return { status: "skipped", reason: "no-target" };
  }

  const { body, comments } = buildReviewPost(review);
  try {
    const posted = await postPullRequestReview(
      Number(installation.installationId),
      repo.owner,
      repo.name,
      pr.number,
      review.headSha,
      body,
      comments,
    );
    await updatePullRequestReview(reviewId, {
      postedAt: new Date(),
      postedUrl: posted.htmlUrl,
      postError: null,
    });
    return { status: "posted", url: posted.htmlUrl };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to post the review to GitHub.";
    await updatePullRequestReview(reviewId, { postError: message });
    throw err;
  }
}
