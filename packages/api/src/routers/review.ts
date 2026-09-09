import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  countCompletedReviewsForFeature,
  getFeatureRequest,
  getLatestReviewForFeature,
  getPullRequestReview,
  listPullRequestsByFeature,
  listReviewQueue,
  listReviewsForFeature,
} from "@throughline/db";
import { MAX_FIX_ROUNDS, startPullRequestReview } from "../github-jobs";
import { postReviewToGithub } from "../review-posting";
import { assertAiReviewCreditsAvailable } from "../billing-guards";
import { protectedProcedure, router } from "../trpc";

export const reviewRouter = router({
  /**
   * The latest AI review for a feature (any of its linked PRs), or null if none
   * has run yet — the Review tab's data source. Workspace-scoped.
   */
  getForFeature: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      getLatestReviewForFeature(ctx.workspaceId, input.featureRequestId),
    ),

  /**
   * Every review run for a feature, newest first — the re-review history. The
   * Review tab shows the newest run as the headline verdict and the rest as a
   * trail of how findings changed across the fix loop. Workspace-scoped.
   */
  listForFeature: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      listReviewsForFeature(ctx.workspaceId, input.featureRequestId),
    ),

  /**
   * The workspace review queue — every feature in the review loop with its
   * latest verdict. Powers the Reviews cockpit page. Workspace-scoped.
   */
  queue: protectedProcedure.query(({ ctx }) => listReviewQueue(ctx.workspaceId)),

  /**
   * Fix-loop state for a feature: how many review rounds it has had and whether
   * the circuit breaker has tripped. Once `capped` is true, a still-blocking
   * review no longer auto-generates a new fix plan — a human takes over — so the
   * Fixes tab uses this to stop waiting on a plan that will never come and to
   * prompt manual intervention. Workspace-scoped.
   */
  fixLoopStatus: protectedProcedure
    .input(z.object({ featureRequestId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rounds = await countCompletedReviewsForFeature(
        ctx.workspaceId,
        input.featureRequestId,
      );
      return { rounds, maxRounds: MAX_FIX_ROUNDS, capped: rounds >= MAX_FIX_ROUNDS };
    }),

  /**
   * Run (or re-run) an AI review for a feature's linked pull request. Picks the
   * feature's most recently active PR when none is specified. Idempotent per
   * commit — starting one while a review for the current head already exists
   * returns that review instead of duplicating it.
   */
  start: protectedProcedure
    .input(
      z.object({
        featureRequestId: z.string().min(1),
        pullRequestId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feature = await getFeatureRequest(ctx.workspaceId, input.featureRequestId);
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      }

      const linked = await listPullRequestsByFeature(
        ctx.workspaceId,
        input.featureRequestId,
      );
      const target = input.pullRequestId
        ? linked.find((pr) => pr.id === input.pullRequestId)
        : linked[0];
      if (!target) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This feature has no linked pull request to review.",
        });
      }

      // Block out-of-credits up front with an actionable upgrade message. The
      // credit is consumed inside startPullRequestReview only if a new run is
      // actually created (idempotent re-entry for the same commit won't charge).
      await assertAiReviewCreditsAvailable(ctx.workspaceId);

      const review = await startPullRequestReview(ctx.workspaceId, target.id);
      if (!review) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Couldn't start a review for this pull request.",
        });
      }
      return review;
    }),

  /**
   * Re-attempt posting a completed review to its GitHub PR after a failure. The
   * automatic post runs in the review workflow; this is the manual retry. Safe
   * to call repeatedly — already-posted runs are a no-op.
   */
  retryPost: protectedProcedure
    .input(z.object({ reviewId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const review = await getPullRequestReview(ctx.workspaceId, input.reviewId);
      if (!review) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Review not found." });
      }
      try {
        return await postReviewToGithub(ctx.workspaceId, input.reviewId);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? `Couldn't post the review to GitHub: ${err.message}`
              : "Couldn't post the review to GitHub.",
        });
      }
    }),
});
