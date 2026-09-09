import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTask,
  deleteTask,
  getPrd,
  getTask,
  listPlans,
  listTasksByFeatureRequest,
  listTasksByPrd,
  reorderTasks,
  updateTask,
  updateTaskStatus,
} from "@throughline/db";
import { protectedProcedure, router } from "../trpc";

/** The three Kanban columns a task can occupy. */
export const taskStatusSchema = z.enum(["todo", "in-progress", "done"]);

export const taskRouter = router({
  // Every planned feature in the workspace (one row per plan), for the Plan
  // page. Workspace-scoped in the query helper.
  listPlans: protectedProcedure.query(({ ctx }) => listPlans(ctx.workspaceId)),

  // List a PRD's (or a feature request's) tasks, board-ordered. Exactly one of
  // prdId / featureRequestId must be supplied.
  list: protectedProcedure
    .input(
      z
        .object({
          prdId: z.string().optional(),
          featureRequestId: z.string().optional(),
        })
        .refine((v) => Boolean(v.prdId) !== Boolean(v.featureRequestId), {
          message: "Provide exactly one of prdId or featureRequestId.",
        }),
    )
    .query(({ ctx, input }) =>
      input.prdId
        ? listTasksByPrd(ctx.workspaceId, input.prdId)
        : listTasksByFeatureRequest(ctx.workspaceId, input.featureRequestId!),
    ),

  create: protectedProcedure
    .input(
      z.object({
        prdId: z.string(),
        title: z.string().min(1, "Title is required").max(200),
        description: z.string().max(5000).optional(),
        status: taskStatusSchema.default("todo"),
        requirementRefs: z.array(z.string()).optional(),
        dependsOn: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Workspace scoping + featureRequestId derivation: never trust the client
      // for the parent link — resolve it from the PRD the caller actually owns.
      const prdRow = await getPrd(ctx.workspaceId, input.prdId);
      if (!prdRow) throw new TRPCError({ code: "NOT_FOUND" });
      // The new task lands at the end of its chosen column.
      const siblings = await listTasksByPrd(ctx.workspaceId, input.prdId);
      const orderIndex = siblings.filter(
        (t) => t.status === input.status,
      ).length;
      // Continue the plan's numbering: next number after the current max.
      const seq =
        siblings.reduce((max, t) => Math.max(max, t.seq), 0) + 1;
      return createTask(ctx.workspaceId, {
        prdId: input.prdId,
        featureRequestId: prdRow.featureRequestId,
        title: input.title,
        description: input.description,
        status: input.status,
        requirementRefs: input.requirementRefs,
        dependsOn: input.dependsOn,
        orderIndex,
        seq,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1, "Title is required").max(200),
        description: z.string().max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getTask(ctx.workspaceId, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return updateTask(ctx.workspaceId, input.id, {
        title: input.title,
        description: input.description,
      });
    }),

  // Persist a re-laid-out board: each task's column + position. Workspace-
  // scoped per row, so stale or cross-tenant ids are skipped, not mutated.
  reorder: protectedProcedure
    .input(
      z.object({
        tasks: z
          .array(
            z.object({
              id: z.string(),
              status: taskStatusSchema,
              orderIndex: z.number().int().nonnegative(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(({ ctx, input }) =>
      reorderTasks(ctx.workspaceId, input.tasks),
    ),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: taskStatusSchema,
        orderIndex: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getTask(ctx.workspaceId, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return updateTaskStatus(ctx.workspaceId, input.id, {
        status: input.status,
        orderIndex: input.orderIndex,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getTask(ctx.workspaceId, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteTask(ctx.workspaceId, input.id);
      return { id: input.id };
    }),
});
