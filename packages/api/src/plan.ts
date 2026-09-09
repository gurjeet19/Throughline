import { createWorkflowRun } from "@throughline/db";
import { inngest, EVENTS } from "./inngest";

/**
 * Kick off task planning for a freshly approved PRD: create the
 * progress row and fire the `generate-tasks` workflow. The run is keyed on the
 * feature request id so the existing per-request progress UI surfaces it.
 */
export async function startTaskGeneration(
  workspaceId: string,
  prdId: string,
  featureRequestId: string,
) {
  const run = await createWorkflowRun(workspaceId, {
    entityId: featureRequestId,
    entityType: "feature_request",
    functionName: "generate-tasks",
  });
  await inngest.send({
    name: EVENTS.prdApproved,
    data: { workspaceId, prdId, featureRequestId, workflowRunId: run.id },
  });
  return run;
}
