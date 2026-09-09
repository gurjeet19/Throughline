import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  advanceFeatureToReview,
  connectRepository,
  deleteGithubInstallation,
  deleteRepository,
  getFeatureRequest,
  getGithubInstallation,
  getPullRequest,
  getPullRequestDiff,
  getRepository,
  getWorkspaceMemberRole,
  listPullRequests,
  listPullRequestsByFeature,
  listRepositories,
  setPullRequestFeature,
  setTasksStatusForFeature,
  startFeatureDevelopment,
} from "@throughline/db";
import {
  branchUrl,
  buildInstallUrl,
  createBranch,
  featureBranchName,
  getAppSlug,
  getInstallationAccount,
  getInstallationRepoCount,
  isGithubConfigured,
  listInstallationRepositories,
} from "@throughline/github";
import { startPrDiffFetch, startPullRequestReview } from "../github-jobs";
import { assertRepositoryLimitAvailable } from "../billing-guards";
import { protectedProcedure, router } from "../trpc";

/** Guard a mutation behind workspace owner/admin. Throws FORBIDDEN otherwise. */
async function requireAdmin(workspaceId: string, userId: string) {
  const role = await getWorkspaceMemberRole(workspaceId, userId);
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an owner or admin can manage GitHub repositories.",
    });
  }
}

export const githubRouter = router({
  /**
   * Live connection status for the active workspace. The "connected" state and
   * account login are derived from a real GitHub API call against the
   * workspace's installation token — never hardcoded — so a revoked install
   * surfaces as disconnected.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    if (!isGithubConfigured()) {
      return { configured: false as const, connected: false as const };
    }

    // The (re)install URL carries the workspace id as `state` so the callback
    // can bind the resulting installation to the right tenant.
    let connectUrl: string | undefined;
    try {
      const slug = await getAppSlug();
      if (slug) connectUrl = buildInstallUrl(slug, ctx.workspaceId);
    } catch {
      // App credentials invalid/unreachable — leave connectUrl undefined.
    }

    const installation = await getGithubInstallation(ctx.workspaceId);
    if (!installation) {
      return { configured: true as const, connected: false as const, connectUrl };
    }

    const installationId = Number(installation.installationId);
    try {
      const [account, repoCount] = await Promise.all([
        getInstallationAccount(installationId),
        getInstallationRepoCount(installationId),
      ]);
      return {
        configured: true as const,
        connected: true as const,
        accountLogin: account.accountLogin,
        accountType: account.accountType,
        repoCount,
        connectUrl,
      };
    } catch {
      // The row exists but GitHub rejects the token (uninstalled/revoked on
      // GitHub's side). Report disconnected with the last-known account.
      return {
        configured: true as const,
        connected: false as const,
        accountLogin: installation.accountLogin,
        connectUrl,
        stale: true as const,
      };
    }
  }),

  /** Disconnect the workspace's installation. Owner/admin only. */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await requireAdmin(ctx.workspaceId, ctx.user.id);
    await deleteGithubInstallation(ctx.workspaceId);
    return { ok: true };
  }),

  /**
   * Repositories the workspace's installation can access, fetched live via the
   * installation token. Each is flagged `connected` if it already has a row, so
   * the UI can show one combined pick-list. Empty when not installed.
   */
  availableRepos: protectedProcedure.query(async ({ ctx }) => {
    const installation = await getGithubInstallation(ctx.workspaceId);
    if (!installation) return [];
    const [accessible, connected] = await Promise.all([
      listInstallationRepositories(Number(installation.installationId)),
      listRepositories(ctx.workspaceId),
    ]);
    const connectedRepoIds = new Set(connected.map((r) => r.repoId));
    return accessible.map((repo) => ({
      ...repo,
      connected: connectedRepoIds.has(repo.repoId),
    }));
  }),

  /** The workspace's connected repositories (persisted rows). Tenant-scoped. */
  connectedRepos: protectedProcedure.query(async ({ ctx }) => {
    return listRepositories(ctx.workspaceId);
  }),

  /**
   * Connect one of the installation's repos. Owner/admin only. We re-fetch the
   * installation's accessible repos and match by `repoId` so a client can never
   * connect a repo the App can't actually access (no trusting client identity).
   */
  connectRepo: protectedProcedure
    .input(z.object({ repoId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.workspaceId, ctx.user.id);

      const installation = await getGithubInstallation(ctx.workspaceId);
      if (!installation) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect the GitHub App before connecting a repository.",
        });
      }

      const accessible = await listInstallationRepositories(
        Number(installation.installationId),
      );
      const repo = accessible.find((r) => r.repoId === input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That repository isn't accessible to this installation.",
        });
      }

      // Enforce the plan's repository limit — but a re-connect of an already
      // connected repo is an idempotent no-op (unique on workspace+repo), so it
      // doesn't count against the limit.
      const alreadyConnected = (await listRepositories(ctx.workspaceId)).some(
        (r) => r.repoId === repo.repoId,
      );
      if (!alreadyConnected) {
        await assertRepositoryLimitAvailable(ctx.workspaceId);
      }

      return connectRepository(ctx.workspaceId, {
        installationId: installation.installationId,
        repoId: repo.repoId,
        nodeId: repo.nodeId,
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
      });
    }),

  /** Disconnect a connected repo (removes the row only). Owner/admin only. */
  disconnectRepo: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.workspaceId, ctx.user.id);
      const existing = await getRepository(ctx.workspaceId, input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
      }
      await deleteRepository(ctx.workspaceId, input.id);
      return { ok: true };
    }),

  /**
   * Tracked pull requests for one of the workspace's connected repos, ingested
   * live from webhooks. Verifies the repo belongs to the caller's workspace, so
   * one workspace can never read another's PRs.
   */
  pullRequests: protectedProcedure
    .input(z.object({ repositoryId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const repo = await getRepository(ctx.workspaceId, input.repositoryId);
      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
      }
      return listPullRequests(ctx.workspaceId, input.repositoryId);
    }),

  /**
   * Start development: tie a plan-approved feature to a connected repo +
   * implementer, create its `throughline/<feature-id>` branch off the repo's
   * default branch via the installation token, and advance the feature to
   * `in-development`. Branch creation is idempotent (re-running is safe).
   */
  startDevelopment: protectedProcedure
    .input(
      z.object({
        featureRequestId: z.string().min(1),
        repositoryId: z.string().min(1),
        implementer: z.enum(["developer", "agent"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      if (feature.status !== "plan-approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a plan-approved feature can start development.",
        });
      }

      const repo = await getRepository(ctx.workspaceId, input.repositoryId);
      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
      }

      const branch = featureBranchName(feature.id);
      try {
        await createBranch(
          Number(repo.installationId),
          repo.owner,
          repo.name,
          repo.defaultBranch,
          branch,
        );
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? `Couldn't create the branch on GitHub: ${err.message}`
              : "Couldn't create the branch on GitHub.",
        });
      }

      const updated = await startFeatureDevelopment(
        ctx.workspaceId,
        feature.id,
        {
          repositoryId: repo.id,
          developmentBranch: branch,
          implementer: input.implementer,
        },
      );
      // Development has begun: move the plan's outstanding tasks into progress so
      // the board tracks the work. Only when the transition actually happened.
      if (updated) {
        await setTasksStatusForFeature(
          ctx.workspaceId,
          feature.id,
          "in-progress",
          ["todo"],
        );
      }
      return updated;
    }),

  /**
   * The development linkage for a feature: its repo, branch, implementer, the
   * PRs linked to it (live), and the repo's other PRs available to link
   * manually. All workspace-scoped.
   */
  featureDevelopment: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      if (!feature.repositoryId || !feature.developmentBranch) {
        return { started: false as const };
      }
      const repo = await getRepository(ctx.workspaceId, feature.repositoryId);
      const linked = await listPullRequestsByFeature(ctx.workspaceId, feature.id);
      const linkable = repo
        ? (await listPullRequests(ctx.workspaceId, repo.id)).filter(
            (pr) => !pr.featureRequestId,
          )
        : [];
      return {
        started: true as const,
        implementer: feature.implementer,
        branch: feature.developmentBranch,
        repository: repo
          ? {
              id: repo.id,
              owner: repo.owner,
              name: repo.name,
              defaultBranch: repo.defaultBranch,
              branchUrl: branchUrl(repo.owner, repo.name, feature.developmentBranch),
            }
          : null,
        linkedPullRequests: linked,
        linkablePullRequests: linkable,
      };
    }),

  /**
   * Manually link a tracked PR to a feature (fallback for non-conventional
   * branches). Advances the feature in-development → in-review, mirroring the
   * webhook auto-link. Both must belong to the caller's workspace.
   */
  linkPullRequest: protectedProcedure
    .input(
      z.object({
        pullRequestId: z.string().min(1),
        featureRequestId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const pr = await getPullRequest(ctx.workspaceId, input.pullRequestId);
      if (!pr) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pull request not found." });
      }
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      await setPullRequestFeature(ctx.workspaceId, pr.id, feature.id);
      await advanceFeatureToReview(ctx.workspaceId, feature.id);
      // Kick off the AI review now that the PR is linked and the feature is in
      // review. Idempotent per commit, and a no-op if the diff isn't ready yet
      // (the review workflow fetches it itself).
      await startPullRequestReview(ctx.workspaceId, pr.id);
      return { ok: true };
    }),

  /** Unlink a PR from its feature (clears the link only). Tenant-scoped. */
  unlinkPullRequest: protectedProcedure
    .input(z.object({ pullRequestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const pr = await getPullRequest(ctx.workspaceId, input.pullRequestId);
      if (!pr) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pull request not found." });
      }
      await setPullRequestFeature(ctx.workspaceId, pr.id, null);
      return { ok: true };
    }),

  /**
   * A PR's stored diff snapshot plus the PR's current head, so the detail view
   * can render the changed files/diff and tell whether the snapshot is stale
   * (its `headSha` lags the PR). Workspace-scoped.
   */
  prDiff: protectedProcedure
    .input(z.object({ pullRequestId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const pr = await getPullRequest(ctx.workspaceId, input.pullRequestId);
      if (!pr) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pull request not found." });
      }
      const snapshot = await getPullRequestDiff(ctx.workspaceId, pr.id);
      return {
        pullRequest: {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          merged: pr.merged,
          headSha: pr.headSha,
          htmlUrl: pr.htmlUrl,
        },
        snapshot,
        stale: !snapshot || snapshot.headSha !== pr.headSha,
      };
    }),

  /** Trigger a background re-fetch of a PR's changed files + diff. */
  refetchPrDiff: protectedProcedure
    .input(z.object({ pullRequestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const pr = await getPullRequest(ctx.workspaceId, input.pullRequestId);
      if (!pr) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pull request not found." });
      }
      await startPrDiffFetch(ctx.workspaceId, pr.id);
      return { ok: true };
    }),
});
