import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getFeatureRequest,
  getLatestPrdForRequest,
  getLatestReleaseReadiness,
  getLatestReviewForFeature,
  listPullRequestsByFeature,
  listReleases,
  listReleaseDecisionsForFeature,
  listReviewsForFeature,
  listTasksByFeatureRequest,
  recordReleaseDecision,
  setTasksStatusForFeature,
  updateFeatureRequestStatus,
} from "@throughline/db";
import { startReleaseReadinessCheck } from "../github-jobs";
import { protectedProcedure, router } from "../trpc";

/**
 * Human approval & release.
 *
 * The release router is the verification surface a human reviewer reads before
 * deciding whether to ship: it gathers everything they must verify (PRD, tasks,
 * pull request, AI review history, outstanding issues) plus the decision history
 * into a single readiness payload, and exposes the approve & ship / request
 * changes actions. Workspace-scoped throughout.
 */
export const releaseRouter = router({
  /**
   * The workspace's release record — every shipped feature with its real
   * approver (from the `approved` release_decision), ship time, and linked
   * pull request(s). Powers the Releases view. Workspace-scoped, live.
   */
  list: protectedProcedure.query(({ ctx }) => listReleases(ctx.workspaceId)),

  /**
   * One feature's release-readiness payload. Aggregates the approved PRD, the
   * task plan with completion counts, the linked pull request(s), the full AI
   * review history (newest first), the outstanding (non-blocking) findings from
   * the latest review, and the human decision trail. Everything is read live and
   * tenant-scoped — nothing is hardcoded.
   */
  getReadiness: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }

      const [prd, tasks, pullRequests, reviews, latestReview, decisions, readiness] =
        await Promise.all([
          getLatestPrdForRequest(ctx.workspaceId, input.featureRequestId),
          listTasksByFeatureRequest(ctx.workspaceId, input.featureRequestId),
          listPullRequestsByFeature(ctx.workspaceId, input.featureRequestId),
          listReviewsForFeature(ctx.workspaceId, input.featureRequestId),
          getLatestReviewForFeature(ctx.workspaceId, input.featureRequestId),
          listReleaseDecisionsForFeature(ctx.workspaceId, input.featureRequestId),
          getLatestReleaseReadiness(ctx.workspaceId, input.featureRequestId),
        ]);

      const taskSummary = {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done").length,
        inProgress: tasks.filter((t) => t.status === "in-progress").length,
        todo: tasks.filter((t) => t.status === "todo").length,
      };

      // Outstanding issues = the non-blocking findings the human accepts (or
      // not) when approving. A feature only reaches awaiting-approval with no
      // blocking findings, so the latest review's non-blocking findings are the
      // ones still on the table.
      const outstandingFindings =
        latestReview?.findings.filter((f) => f.severity === "non-blocking") ?? [];

      return {
        feature,
        prd,
        tasks,
        taskSummary,
        pullRequests,
        reviews,
        latestReview,
        outstandingFindings,
        decisions,
        readiness,
      };
    }),

  /**
   * The latest AI release-readiness assessment for a feature, or null if none
   * has run — a focused query the cockpit polls while an assessment is in
   * flight. Workspace-scoped.
   */
  getAssessment: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      getLatestReleaseReadiness(ctx.workspaceId, input.featureRequestId),
    ),

  /**
   * Run (or re-run) the AI release-readiness assessment from the cockpit. Only
   * meaningful while a feature awaits approval. Idempotent per feature +
   * reviewed commit — a pending/running/completed assessment for the current
   * review head is returned instead of starting a second; a failed one re-runs.
   */
  runReadinessCheck: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      if (feature.status !== "awaiting-approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Readiness checks run while a feature awaits approval.",
        });
      }
      const readiness = await startReleaseReadinessCheck(
        ctx.workspaceId,
        input.featureRequestId,
      );
      if (!readiness) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An AI review must run before a readiness check.",
        });
      }
      return readiness;
    }),

  /**
   * The human "Approve & Ship" call. The deliberate release gate —
   * only a person reaches it, never an AI step. Guarded to `awaiting-approval`:
   * re-shipping an already-`shipped` feature is a safe no-op, any other status
   * is rejected. On approval it transitions the feature to the terminal
   * `shipped` state, records an `approved` decision (reviewer + time), and
   * sweeps every task — feature and fix kinds, from every column — into `done`
   * so the board's middle columns empty. All three writes are workspace-scoped
   * and idempotent. Returns the shipped feature.
   */
  approveAndShip: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      // Re-shipping is a safe no-op (idempotent against a redelivered action).
      if (feature.status === "shipped") return feature;
      if (feature.status !== "awaiting-approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a feature awaiting approval can be shipped.",
        });
      }

      const [shipped] = await Promise.all([
        updateFeatureRequestStatus(ctx.workspaceId, input.featureRequestId, {
          status: "shipped",
        }),
        recordReleaseDecision(ctx.workspaceId, {
          featureRequestId: input.featureRequestId,
          decision: "approved",
          reviewedBy: ctx.user.id,
        }),
        // Sweep every task (all columns, all kinds, incl. fix tasks) to done —
        // no fromStatuses means the whole feature, idempotent on re-ship.
        setTasksStatusForFeature(
          ctx.workspaceId,
          input.featureRequestId,
          "done",
        ),
      ]);

      return shipped;
    }),

  /**
   * The human "Request changes" call — the reject half of the release
   * decision. Guarded to `awaiting-approval` and requires a reason. It records a
   * `rejected` decision (reviewer + reason) and sends the feature back into the
   * fix loop as `changes-requested`: the board reopens, the team resolves and
   * pushes, and a clean re-review returns it to `awaiting-approval` so the
   * approve/reject cycle can repeat. Workspace-scoped.
   */
  requestChanges: protectedProcedure
    .input(
      z.object({
        featureRequestId: z.string().min(1),
        reason: z.string().trim().min(1, "A reason is required."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }
      if (feature.status !== "awaiting-approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a feature awaiting approval can be sent back.",
        });
      }

      const [updated] = await Promise.all([
        updateFeatureRequestStatus(ctx.workspaceId, input.featureRequestId, {
          status: "changes-requested",
        }),
        recordReleaseDecision(ctx.workspaceId, {
          featureRequestId: input.featureRequestId,
          decision: "rejected",
          reviewedBy: ctx.user.id,
          reason: input.reason,
        }),
      ]);

      return updated;
    }),
});
