import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createProject,
  ensureDefaultProject,
  getProject,
  listFeatureRequestsByProject,
  listProjects,
  listProjectsWithRollup,
  listRepositoriesForProject,
  renameProject,
} from "@throughline/db";
import { protectedProcedure, router } from "../trpc";

/**
 * Projects — the tenant resource between a workspace and its feature requests.
 * Every read ensures the workspace's default project exists first, so the very
 * first call from a pre-project workspace still returns a usable home. Every
 * procedure is workspace-scoped through the tRPC tenant middleware; a project
 * can never be read or mutated across workspaces.
 */
export const projectRouter = router({
  /** Plain project list (default first) — the data the switcher needs. */
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureDefaultProject(ctx.workspaceId);
    return listProjects(ctx.workspaceId);
  }),

  /** Projects with live rollup counts — powers the Projects index page. */
  listWithRollup: protectedProcedure.query(({ ctx }) =>
    listProjectsWithRollup(ctx.workspaceId),
  ),

  /**
   * One project's detail payload: the project, its feature requests, the
   * repositories its work touches, and a lifecycle rollup across the pipeline —
   * all live and tenant-scoped.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const proj = await getProject(ctx.workspaceId, input.id);
      if (!proj) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }
      const [features, repositories] = await Promise.all([
        listFeatureRequestsByProject(ctx.workspaceId, input.id),
        listRepositoriesForProject(ctx.workspaceId, input.id),
      ]);

      const shipped = features.filter((f) => f.status === "shipped").length;
      const lifecycle = {
        total: features.length,
        shipped,
        inFlight: features.length - shipped,
      };

      return { project: proj, features, repositories, lifecycle };
    }),

  /** Create a project. Slug is derived + de-duplicated server-side. */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "A name is required.").max(80),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createProject(ctx.workspaceId, {
        name: input.name,
        description: input.description,
      }),
    ),

  /** Rename a project (and optionally edit its description). Slug stays stable. */
  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1, "A name is required.").max(80),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await renameProject(ctx.workspaceId, input.id, {
        name: input.name,
        description: input.description,
      });
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }
      return updated;
    }),
});
