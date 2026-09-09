import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  approvePrd,
  getLatestPrdForRequest,
  getPrd,
  listPrds,
  updatePrd,
} from "@throughline/db";
import { protectedProcedure, router } from "../trpc";
import { startTaskGeneration } from "../plan";

export const prdRouter = router({
  list: protectedProcedure.query(({ ctx }) => listPrds(ctx.workspaceId)),

  getForRequest: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(({ ctx, input }) =>
      getLatestPrdForRequest(ctx.workspaceId, input.featureRequestId),
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        problemStatement: z.string(),
        goals: z.array(z.string()),
        nonGoals: z.array(z.string()),
        userStories: z.array(z.string()),
        acceptanceCriteria: z.array(z.string()),
        edgeCases: z.array(z.string()),
        successMetrics: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...sections } = input;
      // Workspace scoping: getPrd only returns a row in the caller's workspace,
      // so a cross-workspace id is rejected here rather than via UI hiding.
      const existing = await getPrd(ctx.workspaceId, id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return updatePrd(ctx.workspaceId, id, sections);
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getPrd(ctx.workspaceId, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.status !== "drafted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a drafted PRD can be approved.",
        });
      }
      const approved = await approvePrd(ctx.workspaceId, input.id, ctx.user.id);
      // Approval kicks off task generation.
      if (approved) {
        await startTaskGeneration(
          ctx.workspaceId,
          approved.id,
          approved.featureRequestId,
        );
      }
      return approved;
    }),
});
