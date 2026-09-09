import { z } from "zod";
import {
  createFeatureRequest,
  createWorkflowRun,
  ensureDefaultProject,
} from "@throughline/db";
import { inngest, EVENTS } from "./inngest";

/**
 * The intake channels a request can arrive through (PRD user story 7). The
 * pipeline is channel-agnostic — this is purely provenance, recorded on the
 * request and surfaced in the UI.
 */
export const intakeChannelSchema = z.enum([
  "manual",
  "email",
  "support_ticket",
  "customer_call",
]);

export type IntakeChannel = z.infer<typeof intakeChannelSchema>;

/** The channel values, for building UI selectors. */
export const INTAKE_CHANNELS = intakeChannelSchema.options;

/** Validated shape of an inbound /api/ingest request body. */
export const ingestPayloadSchema = z.object({
  channel: intakeChannelSchema.default("manual"),
  content: z.string().min(1, "content is required").max(10000),
  title: z.string().trim().max(200).optional(),
});

/**
 * Create the progress row and fire the processing workflow for an existing
 * request. Also used to re-trigger triage after clarifications are answered.
 */
export async function startProcessing(
  workspaceId: string,
  featureRequestId: string,
) {
  const run = await createWorkflowRun(workspaceId, {
    entityId: featureRequestId,
    entityType: "feature_request",
    functionName: "process-request",
  });
  await inngest.send({
    name: EVENTS.requestSubmitted,
    data: { workspaceId, featureRequestId, workflowRunId: run.id },
  });
  return run;
}

/**
 * The single entry point for a new feature request, whatever channel it
 * arrives through (manual form or the inbound /api/ingest endpoint): persist
 * it, then kick off the triage → PRD workflow.
 */
export async function submitFeatureRequest(
  workspaceId: string,
  input: { rawContent: string; channel: IntakeChannel; projectId?: string },
) {
  // Every request belongs to a project. Use the caller's choice when given,
  // otherwise fall back to the workspace's default project (created lazily) so
  // the channel-agnostic intake — including the public /api/ingest endpoint —
  // never has to know about projects.
  const projectId =
    input.projectId ?? (await ensureDefaultProject(workspaceId)).id;
  const request = await createFeatureRequest(workspaceId, {
    rawContent: input.rawContent,
    channel: input.channel,
    projectId,
  });
  await startProcessing(workspaceId, request.id);
  return request;
}
