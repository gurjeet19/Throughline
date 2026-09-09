import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAgentProposal,
  getFeatureRequest,
  getGithubInstallation,
  getLatestAgentProposal,
  getLatestReviewForFeature,
  getRepository,
  incrementAiCodingAgentRunsUsed,
  listPullRequestsByFeature,
  setFeatureImplementer,
  supersedeAgentProposals,
  updateAgentProposal,
  type ReviewFinding,
} from "@throughline/db";
import {
  commitChangesAndOpenPullRequest,
  commitChangesToBranch,
} from "@throughline/github";
import { startAgentCodegen } from "../github-jobs";
import { assertCodingAgentCreditsAvailable } from "../billing-guards";
import { protectedProcedure, router } from "../trpc";

function titleOf(raw: string): string {
  const sep = raw.indexOf("\n\n");
  return (sep === -1 ? raw : raw.slice(0, sep)).trim() || "Throughline feature";
}

/**
 * Render a review's blocking findings as agent feedback, so a fix-mode codegen
 * run is told exactly what to repair. Mirrors the reviewer's own language.
 */
function blockingFindingsFeedback(findings: ReviewFinding[]): string {
  const blocking = findings.filter((f) => f.severity === "blocking");
  if (blocking.length === 0) return "";
  const lines = blocking.map((f, i) => {
    const where = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : "";
    return (
      `${i + 1}. [${f.dimension}]${where} ${f.title}\n` +
      `   ${f.explanation}\n` +
      `   Fix: ${f.recommendation}`
    );
  });
  return (
    "The previous implementation failed AI review with these BLOCKING issues. " +
    "Resolve EVERY one of them and change nothing unrelated:\n\n" +
    lines.join("\n")
  );
}

export const agentRouter = router({
  /**
   * Start (or regenerate) a coding-agent proposal for an in-development feature
   * whose implementer is the Throughline agent. Supersedes any open proposal so
   * only the newest is active; `feedback` is carried into a regenerate.
   */
  generate: protectedProcedure
    .input(
      z.object({
        featureRequestId: z.string().min(1),
        feedback: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      // The agent runs on its own features, either implementing (in-development)
      // or fixing (fix-needed, the fix loop).
      const canRun =
        feature.status === "in-development" || feature.status === "fix-needed";
      if (feature.implementer !== "agent" || !canRun) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The coding agent runs only on an in-development or fix-needed agent feature.",
        });
      }

      // The coding agent is the metered premium workflow — block out-of-runs up
      // front with an upgrade message before doing any work.
      await assertCodingAgentCreditsAvailable(ctx.workspaceId);

      // In fix mode, seed the run with the review's blocking findings (unless the
      // caller passed explicit feedback), so the agent repairs exactly what the
      // review flagged.
      let feedback = input.feedback;
      if (feature.status === "fix-needed" && !feedback) {
        const review = await getLatestReviewForFeature(
          ctx.workspaceId,
          input.featureRequestId,
        );
        feedback = review ? blockingFindingsFeedback(review.findings) : undefined;
      }

      await supersedeAgentProposals(ctx.workspaceId, input.featureRequestId);
      const proposal = await startAgentCodegen(
        ctx.workspaceId,
        input.featureRequestId,
        feedback,
      );
      // Consume a coding-agent run now that one has actually started. Each
      // generate/regenerate is a fresh, billable run (no idempotent re-entry).
      await incrementAiCodingAgentRunsUsed(ctx.workspaceId);
      return proposal;
    }),

  /** The latest proposal for a feature (status, summary, changes, error). */
  getProposal: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      getLatestAgentProposal(ctx.workspaceId, input.featureRequestId),
    ),

  /**
   * Confirm a ready proposal: commit its changes to the feature branch and open
   * the PR. Nothing reached GitHub before this point. The webhook + linkage then
   * advance the feature to in-review automatically.
   */
  confirm: protectedProcedure
    .input(z.object({ proposalId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await getAgentProposal(ctx.workspaceId, input.proposalId);
      if (!proposal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found." });
      }
      if (proposal.status !== "ready") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a ready proposal can be confirmed.",
        });
      }

      const feature = await getFeatureRequest(ctx.workspaceId, proposal.featureRequestId);
      if (!feature?.repositoryId || !feature.developmentBranch) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Feature is not linked to a repository branch.",
        });
      }
      const repo = await getRepository(ctx.workspaceId, feature.repositoryId);
      const installation = await getGithubInstallation(ctx.workspaceId);
      if (!repo || !installation) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Repository or installation is unavailable.",
        });
      }

      const title = titleOf(feature.rawContent);
      const changes = proposal.changes.map((c) => ({
        path: c.path,
        action: c.action,
        newContent: c.newContent,
      }));

      // If the feature already has an open PR, this is a fix: push the changes
      // onto its branch (no new PR). The GitHub `synchronize` webhook then
      // re-fetches the diff and starts an automatic re-review. Otherwise it's the
      // first implementation — open the PR, and the webhook links + reviews it.
      const linked = await listPullRequestsByFeature(
        ctx.workspaceId,
        proposal.featureRequestId,
      );
      const openPr = linked.find((p) => p.state === "open" && !p.merged);

      let pr: { number: number; htmlUrl: string };
      try {
        if (openPr) {
          await commitChangesToBranch(
            Number(repo.installationId),
            repo.owner,
            repo.name,
            feature.developmentBranch,
            changes,
            `fix: ${title}`,
          );
          pr = { number: openPr.number, htmlUrl: openPr.htmlUrl };
        } else {
          pr = await commitChangesAndOpenPullRequest(
            Number(repo.installationId),
            repo.owner,
            repo.name,
            feature.developmentBranch,
            repo.defaultBranch,
            changes,
            `feat: ${title}`,
            title,
            `${proposal.summary}\n\n— Implemented by the Throughline coding agent.`,
          );
        }
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? `Couldn't commit the changes: ${err.message}`
              : "Couldn't commit the changes.",
        });
      }

      await updateAgentProposal(proposal.id, {
        status: "committed",
        prNumber: pr.number,
        prUrl: pr.htmlUrl,
      });
      return { ...pr, mode: openPr ? ("fix" as const) : ("open" as const) };
    }),

  /** Reject a proposal without touching GitHub. */
  reject: protectedProcedure
    .input(z.object({ proposalId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await getAgentProposal(ctx.workspaceId, input.proposalId);
      if (!proposal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found." });
      }
      await updateAgentProposal(proposal.id, { status: "rejected" });
      return { ok: true };
    }),

  /** Fall back to the Developer path: hand implementation back to a human. */
  switchToDeveloper: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      await supersedeAgentProposals(ctx.workspaceId, input.featureRequestId);
      await setFeatureImplementer(ctx.workspaceId, input.featureRequestId, "developer");
      return { ok: true };
    }),

  /** Hand the work to the Throughline agent (e.g. let it fix the blockers). */
  switchToAgent: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      await setFeatureImplementer(ctx.workspaceId, input.featureRequestId, "agent");
      return { ok: true };
    }),
});
