import { createAppAuth } from "@octokit/auth-app";
import { Webhooks } from "@octokit/webhooks";
import { Octokit } from "octokit";

export type { PullRequestEvent } from "@octokit/webhooks-types";

/**
 * GitHub App integration. Throughline acts on a
 * workspace's repositories as an installed GitHub App: it authenticates as the
 * App with a JWT (app id + private key) and, for a given installation, mints a
 * short-lived installation access token via `@octokit/auth-app`. No personal
 * access tokens, no per-user credentials — every call is scoped to the
 * installation a workspace admin granted.
 *
 * All secrets are read from the server environment; nothing here runs on the
 * client.
 */

export type GithubConfig = {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
};

/**
 * PEM keys can't be stored multi-line in a `.env`, so they're typically kept on
 * one line with escaped `\n`. Normalize either form back to a real PEM.
 */
function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/** Reads + validates the GitHub App env. Returns null when not configured. */
export function getGithubConfig(): GithubConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!appId || !privateKey || !clientId || !clientSecret || !webhookSecret) {
    return null;
  }

  return {
    appId,
    privateKey: normalizePrivateKey(privateKey),
    clientId,
    clientSecret,
    webhookSecret,
  };
}

export function isGithubConfigured(): boolean {
  return getGithubConfig() !== null;
}

function requireConfig(): GithubConfig {
  const config = getGithubConfig();
  if (!config) {
    throw new Error(
      "GitHub App is not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, " +
        "GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, and GITHUB_WEBHOOK_SECRET.",
    );
  }
  return config;
}

/** Octokit authenticated as the App itself (JWT) — for app-level endpoints. */
export function appOctokit(): Octokit {
  const { appId, privateKey } = requireConfig();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });
}

/**
 * Octokit scoped to a single installation. `@octokit/auth-app` mints (and
 * refreshes) the installation access token on demand — this is the only client
 * that may touch a workspace's repositories.
 */
export function installationOctokit(installationId: number): Octokit {
  const { appId, privateKey } = requireConfig();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId },
  });
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * Verify a webhook delivery's signature against `GITHUB_WEBHOOK_SECRET` using
 * `@octokit/webhooks` (HMAC-SHA256, constant-time compare). `payload` must be
 * the raw, unparsed request body — re-serializing JSON changes the bytes and
 * breaks the signature. Returns false (never throws) on any mismatch so the
 * route can reject cleanly.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const config = getGithubConfig();
  if (!config) return false;
  const webhooks = new Webhooks({ secret: config.webhookSecret });
  try {
    return await webhooks.verify(payload, signature);
  } catch {
    return false;
  }
}

export type InstallationAccount = {
  accountLogin: string;
  accountType: string;
};

/**
 * Fetch the account a given installation belongs to (login + type). Uses the
 * app JWT, so it also serves as a liveness check that our App credentials and
 * the installation are valid.
 */
export async function getInstallationAccount(
  installationId: number,
): Promise<InstallationAccount> {
  const { data } = await appOctokit().rest.apps.getInstallation({
    installation_id: installationId,
  });
  const account = data.account;
  // `account` can be a user or an org; both expose `login`. Fall back safely.
  const accountLogin =
    account && "login" in account ? account.login : "unknown";
  const accountType =
    account && "type" in account && account.type ? account.type : "Organization";
  return { accountLogin, accountType };
}

/**
 * Count repositories the installation can access, minting and using an
 * installation token end-to-end — proof the integration actually works.
 */
export async function getInstallationRepoCount(
  installationId: number,
): Promise<number> {
  const { data } =
    await installationOctokit(installationId).rest.apps.listReposAccessibleToInstallation(
      { per_page: 1 },
    );
  return data.total_count;
}

export type InstallationRepo = {
  repoId: string;
  nodeId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

/**
 * Every repository the installation can access, fetched live via the
 * installation token (paginated — an installation may grant many repos). This
 * is the catalog the admin picks from when connecting a repo; nothing is
 * hardcoded.
 */
export async function listInstallationRepositories(
  installationId: number,
): Promise<InstallationRepo[]> {
  const octokit = installationOctokit(installationId);
  const repos = await octokit.paginate(
    octokit.rest.apps.listReposAccessibleToInstallation,
    { per_page: 100 },
  );
  return repos.map((repo) => ({
    repoId: String(repo.id),
    nodeId: repo.node_id,
    owner: repo.owner?.login ?? "",
    name: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch ?? "main",
    private: repo.private,
  }));
}

export type RepoTreeEntry = { path: string; size: number };

/**
 * The text files in a branch's tree (path + size), via the installation token.
 * Reads the branch tip → its tree (recursive) and returns blob entries only.
 * The caller decides which to actually load, keeping context bounded.
 */
export async function getRepoTree(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
): Promise<RepoTreeEntry[]> {
  const octokit = installationOctokit(installationId);
  const ref = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const commit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: ref.data.object.sha,
  });
  const tree = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: commit.data.tree.sha,
    recursive: "true",
  });
  return tree.data.tree
    .filter((t) => t.type === "blob" && t.path)
    .map((t) => ({ path: t.path as string, size: t.size ?? 0 }));
}

/** A single file's text contents at a ref, or null if it isn't a text blob. */
export async function getFileContent(
  installationId: number,
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<string | null> {
  const octokit = installationOctokit(installationId);
  try {
    const res = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    const data = res.data;
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return null;
    }
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export type FileChange = {
  path: string;
  action: "create" | "modify" | "delete";
  newContent: string;
};

/**
 * Commit a set of file changes onto `branch` and open a pull request to
 * `baseBranch`, using the Git Data API: build blobs for created/modified files,
 * assemble a tree on top of the branch tip (deletes become null-sha entries),
 * create one commit, advance the ref, then open the PR. Returns the new PR's
 * number and URL.
 */
/**
 * Commit a set of file changes onto the tip of an existing branch and advance
 * the branch ref to the new commit. Returns the new head sha. Used both to seed
 * a feature branch before opening its PR and — in the fix loop — to push
 * a fix commit onto a branch that already has an open PR, which fires the
 * GitHub `synchronize` webhook and triggers an automatic re-review.
 */
export async function commitChangesToBranch(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  changes: FileChange[],
  message: string,
): Promise<{ headSha: string }> {
  const octokit = installationOctokit(installationId);

  // Current tip of the branch — the new commit's parent + base tree.
  const ref = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const baseSha = ref.data.object.sha;
  const baseCommit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  const treeItems = await Promise.all(
    changes.map(async (change) => {
      if (change.action === "delete") {
        return { path: change.path, mode: "100644" as const, type: "blob" as const, sha: null };
      }
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: change.newContent,
        encoding: "utf-8",
      });
      return {
        path: change.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha,
      };
    }),
  );

  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.data.tree.sha,
    tree: treeItems,
  });

  const commit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.data.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
  });

  return { headSha: commit.data.sha };
}

export async function commitChangesAndOpenPullRequest(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  baseBranch: string,
  changes: FileChange[],
  message: string,
  prTitle: string,
  prBody: string,
): Promise<{ number: number; htmlUrl: string }> {
  await commitChangesToBranch(installationId, owner, repo, branch, changes, message);

  const octokit = installationOctokit(installationId);
  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: baseBranch,
    title: prTitle,
    body: prBody,
  });

  return { number: pr.data.number, htmlUrl: pr.data.html_url };
}

export type PullRequestFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  previousFilename?: string;
};

/**
 * A pull request's changed files (paginated), via the installation token. Each
 * entry carries its per-file status and line counts for the changed-file
 * summary; the line-level content comes from the unified diff below.
 */
export async function listPullRequestFiles(
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestFile[]> {
  const octokit = installationOctokit(installationId);
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  return files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    previousFilename: f.previous_filename,
  }));
}

/**
 * A pull request's unified diff, via the installation token. The `diff` media
 * type makes GitHub return the raw patch text (typed as the PR object by
 * Octokit, but a string at runtime).
 */
export async function getPullRequestDiff(
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const octokit = installationOctokit(installationId);
  const res = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: "diff" },
  });
  return res.data as unknown as string;
}

export type ReviewInlineComment = {
  path: string;
  line: number;
  body: string;
};

/**
 * Post an AI review back onto a pull request via the installation token: a
 * single PR review (event `COMMENT` — it comments, it doesn't approve or block
 * the merge; the human gate owns that) carrying the `body` summary plus inline
 * `comments` anchored to a file + line. `commitId` pins the review to the exact
 * commit it evaluated.
 *
 * Inline comments must land on lines GitHub considers part of the diff; an
 * AI-suggested line can fall outside it and make GitHub reject the whole review
 * (422). So on failure we retry once with the inline comments folded into the
 * body text and none attached — the summary always posts rather than the review
 * being lost. Returns the posted review's id + URL.
 */
export async function postPullRequestReview(
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number,
  commitId: string,
  body: string,
  comments: ReviewInlineComment[],
): Promise<{ id: number; htmlUrl: string }> {
  const octokit = installationOctokit(installationId);

  const create = (reviewBody: string, inline: ReviewInlineComment[]) =>
    octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      event: "COMMENT",
      body: reviewBody,
      comments: inline.map((c) => ({
        path: c.path,
        line: c.line,
        side: "RIGHT",
        body: c.body,
      })),
    });

  try {
    const res = await create(body, comments);
    return { id: res.data.id, htmlUrl: res.data.html_url ?? "" };
  } catch (err) {
    if (comments.length === 0) throw err;
    // Likely an inline line outside the diff — re-post the summary with the
    // anchored findings appended as text so nothing is dropped.
    const appended =
      `${body}\n\n---\n\n**Inline findings**\n\n` +
      comments
        .map((c) => `- \`${c.path}:${c.line}\` — ${c.body.replace(/\n+/g, " ")}`)
        .join("\n");
    const res = await create(appended, []);
    return { id: res.data.id, htmlUrl: res.data.html_url ?? "" };
  }
}

/** Throughline's branch-name convention — the link key for a feature's PRs. */
export function featureBranchName(featureId: string): string {
  return `throughline/${featureId}`;
}

/** Public GitHub URL for a branch on a repo. */
export function branchUrl(owner: string, repo: string, branch: string): string {
  return `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}`;
}

/**
 * Create `branch` off `baseBranch`'s current tip in a repo, via the
 * installation token: read the base ref's SHA, then create the new ref. If the
 * branch already exists (a re-started feature), this is treated as success so
 * "Start development" stays idempotent. Returns the tip SHA the branch points
 * at.
 */
export async function createBranch(
  installationId: number,
  owner: string,
  repo: string,
  baseBranch: string,
  branch: string,
): Promise<{ sha: string; alreadyExisted: boolean }> {
  const octokit = installationOctokit(installationId);

  // Tip SHA of the base (default) branch.
  const base = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const sha = base.data.object.sha;

  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha,
    });
    return { sha, alreadyExisted: false };
  } catch (err: unknown) {
    // 422 "Reference already exists" — the branch is already there; fine.
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status?: number }).status === 422
    ) {
      return { sha, alreadyExisted: true };
    }
    throw err;
  }
}

/** The App's slug (from `GET /app`), used to build its public install URL. */
export async function getAppSlug(): Promise<string> {
  const { data } = await appOctokit().rest.apps.getAuthenticated();
  return data?.slug ?? "";
}

/**
 * The GitHub install URL for this App. `state` round-trips through GitHub back
 * to our callback so we can bind the resulting installation to the right
 * workspace.
 */
export function buildInstallUrl(slug: string, state: string): string {
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}
