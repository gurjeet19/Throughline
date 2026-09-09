import { protectedProcedure, publicProcedure, router } from "./trpc";
import { featureRequestRouter } from "./routers/feature-request";
import { workflowRunRouter } from "./routers/workflow-run";
import { prdRouter } from "./routers/prd";
import { taskRouter } from "./routers/task";
import { workspaceRouter } from "./routers/workspace";
import { githubRouter } from "./routers/github";
import { agentRouter } from "./routers/agent";
import { reviewRouter } from "./routers/review";
import { releaseRouter } from "./routers/release";
import { billingRouter } from "./routers/billing";
import { projectRouter } from "./routers/project";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  })),
  whoami: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.user.id,
    workspaceId: ctx.workspaceId,
  })),
  featureRequest: featureRequestRouter,
  workflowRun: workflowRunRouter,
  prd: prdRouter,
  task: taskRouter,
  workspace: workspaceRouter,
  github: githubRouter,
  agent: agentRouter,
  review: reviewRouter,
  release: releaseRouter,
  billing: billingRouter,
  project: projectRouter,
});

export type AppRouter = typeof appRouter;
