import { ensureIngestToken, regenerateIngestToken } from "@throughline/db";
import { protectedProcedure, router } from "../trpc";

export const workspaceRouter = router({
  // Returns (minting on first call) the bearer token external systems use to
  // POST requests into this workspace via /api/ingest.
  getIngestToken: protectedProcedure.query(({ ctx }) =>
    ensureIngestToken(ctx.workspaceId).then((token) => ({ token })),
  ),

  regenerateIngestToken: protectedProcedure.mutation(({ ctx }) =>
    regenerateIngestToken(ctx.workspaceId).then((token) => ({ token })),
  ),
});
