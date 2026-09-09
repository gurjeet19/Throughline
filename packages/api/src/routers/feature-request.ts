import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  answerClarifications,
  approvePlan,
  deleteFeatureRequest,
  getFeatureRequest,
  listFeatureRequests,
  listTasksByFeatureRequest,
} from "@throughline/db";
import { protectedProcedure, router } from "../trpc";
import {
  intakeChannelSchema,
  startProcessing,
  submitFeatureRequest,
} from "../submit";

export const featureRequestRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string().min(1).optional() }).optional())
    .query(({ ctx, input }) =>
      listFeatureRequests(ctx.workspaceId, input?.projectId),
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const request = await getFeatureRequest(ctx.workspaceId, input.id);
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      return request;
    }),

  create: protectedProcedure
    .input(
      z.object({
        rawContent: z.string().min(1, "Content is required").max(10000),
        channel: intakeChannelSchema.default("manual"),
        projectId: z.string().min(1).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      submitFeatureRequest(ctx.workspaceId, {
        rawContent: input.rawContent,
        channel: input.channel,
        projectId: input.projectId,
      }),
    ),

  answerClarification: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        answers: z
          .array(
            z.object({
              question: z.string(),
              answer: z.string().min(1, "Answer cannot be empty"),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await getFeatureRequest(ctx.workspaceId, input.id);
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      if (request.status !== "clarifying") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This request is not awaiting clarification.",
        });
      }
      const updated = await answerClarifications(
        ctx.workspaceId,
        input.id,
        input.answers,
      );
      await startProcessing(ctx.workspaceId, input.id);
      return updated;
    }),

  // The deliberate human approval of the task plan. This is the ONLY path to
  // "plan-approved" — no AI or workflow transitions into it.
  approvePlan: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const request = await getFeatureRequest(ctx.workspaceId, input.id);
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      // Re-approving is a safe no-op.
      if (request.status === "plan-approved") return request;
      if (request.status !== "tasks-planned") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a planned feature can have its plan approved.",
        });
      }
      const tasks = await listTasksByFeatureRequest(ctx.workspaceId, input.id);
      if (tasks.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add at least one task before approving the plan.",
        });
      }
      return approvePlan(ctx.workspaceId, input.id, ctx.user.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getFeatureRequest(ctx.workspaceId, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteFeatureRequest(ctx.workspaceId, input.id);
      return { id: input.id };
    }),
});
