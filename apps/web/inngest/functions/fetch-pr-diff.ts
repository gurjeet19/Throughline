import {
  getGithubInstallation,
  getPullRequest,
  getPullRequestDiff,
  getRepository,
  updateWorkflowRun,
  upsertPullRequestDiff,
} from "@throughline/db";
import {
  getPullRequestDiff as fetchDiff,
  listPullRequestFiles,
} from "@throughline/github";
import { EVENTS } from "@throughline/api";
import { inngest } from "../client";

// A unified diff can be enormous. Cap what we store so a giant PR can't bloat
// the row; the UI shows a "truncated" notice and links out to GitHub.
const MAX_DIFF_BYTES = 600_000;

/**
 * Fetch a pull request's changed files and unified diff live from GitHub and
 * snapshot them for the PR detail view. Keyed on the PR so the per-entity
 * progress UI surfaces the run; each step is crash-safe via Inngest's step
 * memoization.
 *
 *   load PR + repo ─ snapshot already current for headSha? → stop (idempotent)
 *                  └ fetch files + diff via installation token → persist
 */
export const fetchPrDiffFunction = inngest.createFunction(
  { id: "fetch-pr-diff", triggers: [{ event: EVENTS.prDiffRequested }] },
  async ({ event, step }) => {
    const { workspaceId, pullRequestId, workflowRunId } = event.data as {
      workspaceId: string;
      pullRequestId: string;
      workflowRunId: string;
    };

    const context = await step.run("load-pr", async () => {
      await updateWorkflowRun(workflowRunId, {
        status: "running",
        currentStep: "Reading the pull request",
      });
      const pr = await getPullRequest(workspaceId, pullRequestId);
      if (!pr) return null;
      const repo = await getRepository(workspaceId, pr.repositoryId);
      const installation = await getGithubInstallation(workspaceId);
      const existing = await getPullRequestDiff(workspaceId, pullRequestId);
      return { pr, repo, installation, existingSha: existing?.headSha ?? null };
    });

    if (!context || !context.pr || !context.repo || !context.installation) {
      await updateWorkflowRun(workflowRunId, {
        status: "failed",
        currentStep: "Pull request or repository unavailable",
      });
      return { outcome: "not-found" };
    }

    const { pr, repo, installation, existingSha } = context;

    // Idempotency: a snapshot already current for this commit needs no re-fetch.
    if (existingSha === pr.headSha) {
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Diff already up to date",
      });
      return { outcome: "already-current" };
    }

    const fetched = await step.run("fetch-diff", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Fetching changed files and diff",
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
      const diff = truncated
        ? fullDiff.slice(0, MAX_DIFF_BYTES)
        : fullDiff;
      return { files, diff, truncated };
    });

    await step.run("persist-diff", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Saving the diff",
      });
      const additions = fetched.files.reduce((n, f) => n + f.additions, 0);
      const deletions = fetched.files.reduce((n, f) => n + f.deletions, 0);
      await upsertPullRequestDiff(workspaceId, pullRequestId, {
        headSha: pr.headSha,
        files: fetched.files,
        additions,
        deletions,
        diff: fetched.diff,
        truncated: fetched.truncated,
      });
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Diff ready",
      });
    });

    return { outcome: "fetched", files: fetched.files.length };
  },
);
