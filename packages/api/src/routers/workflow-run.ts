import { z } from "zod";
import { getWorkflowRunByEntityId } from "@throughline/db";
import { protectedProcedure, router } from "../trpc";

export const workflowRunRouter = router({
  getByEntityId: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .query(({ ctx, input }) =>
      getWorkflowRunByEntityId(ctx.workspaceId, input.entityId),
    ),
});
