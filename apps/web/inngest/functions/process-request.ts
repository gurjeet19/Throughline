import {
  getFeatureRequest,
  getWorkspaceCatalog,
  setClarificationQuestions,
  updateFeatureRequestStatus,
  updateWorkflowRun,
  createPrd,
} from "@throughline/db";
import { triageRequest, generatePrd } from "@throughline/ai";
import { EVENTS } from "@throughline/api";
import { inngest } from "../client";

/** Max clarification rounds before triage must commit to ready/flagged. */
const MAX_CLARIFICATION_ROUNDS = 2;

/**
 * The entry point of the delivery pipeline: take a freshly submitted (or freshly
 * re-answered) feature request and decide what happens next.
 *
 *   triage ─┬─ exists   → educate the requester, stop
 *           ├─ clarify  → store questions, set "clarifying", stop (await human)
 *           ├─ flagged  → mark for human attention, stop
 *           └─ ready    → generate the PRD, set "prd-drafted"
 *
 * Re-triggered (statelessly) every time the human answers clarifications; the
 * full conversation lives in the DB, so each run is short and crash-safe.
 */
export const processRequestFunction = inngest.createFunction(
  { id: "process-request", triggers: [{ event: EVENTS.requestSubmitted }] },
  async ({ event, step }) => {
    const { workspaceId, featureRequestId, workflowRunId } = event.data as {
      workspaceId: string;
      featureRequestId: string;
      workflowRunId: string;
    };

    const request = await step.run("load-request", async () => {
      await updateWorkflowRun(workflowRunId, {
        status: "running",
        currentStep: "Reviewing the request",
      });
      return getFeatureRequest(workspaceId, featureRequestId);
    });

    if (!request) {
      await updateWorkflowRun(workflowRunId, {
        status: "failed",
        currentStep: "Request not found",
      });
      return { outcome: "not-found" };
    }

    const decision = await step.run("triage", async () => {
      const catalog = await getWorkspaceCatalog(workspaceId, featureRequestId);
      // Count completed clarification *rounds*, not individual questions: every
      // question asked in one batch shares an `askedAt`, so the number of
      // distinct answered timestamps is how many back-and-forths have happened.
      // (Counting questions made a single 2-4 question round look like the
      // limit was already hit, prematurely forcing ready/flagged.)
      const round = new Set(
        request.clarificationHistory
          .filter((h) => h.answer !== null)
          .map((h) => h.askedAt),
      ).size;
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Checking for duplicates and gaps",
      });
      return triageRequest({
        rawContent: request.rawContent,
        clarificationHistory: request.clarificationHistory,
        catalog,
        round,
        maxRounds: MAX_CLARIFICATION_ROUNDS,
      });
    });

    if (decision.decision === "exists") {
      await step.run("mark-exists", async () => {
        await updateFeatureRequestStatus(workspaceId, featureRequestId, {
          status: "exists",
          triageNote: decision.note,
        });
        await updateWorkflowRun(workflowRunId, {
          status: "succeeded",
          currentStep: "Already exists — requester educated",
        });
      });
      return { outcome: "exists" };
    }

    if (decision.decision === "flagged") {
      await step.run("mark-flagged", async () => {
        await updateFeatureRequestStatus(workspaceId, featureRequestId, {
          status: "flagged",
          triageNote: decision.note,
        });
        await updateWorkflowRun(workflowRunId, {
          status: "succeeded",
          currentStep: "Flagged for human attention",
        });
      });
      return { outcome: "flagged" };
    }

    if (decision.decision === "clarify") {
      await step.run("ask-clarifications", async () => {
        await setClarificationQuestions(
          workspaceId,
          featureRequestId,
          decision.questions,
        );
        await updateWorkflowRun(workflowRunId, {
          status: "succeeded",
          currentStep: "Waiting on your answers",
        });
      });
      return { outcome: "clarify", questions: decision.questions.length };
    }

    // decision === "ready" → generate the PRD.
    await step.run("generate-prd", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Drafting the PRD",
      });
      const generated = await generatePrd({
        rawContent: request.rawContent,
        clarificationHistory: request.clarificationHistory,
      });
      await createPrd(workspaceId, {
        featureRequestId,
        ...generated,
      });
      await updateFeatureRequestStatus(workspaceId, featureRequestId, {
        status: "prd-drafted",
        triageNote: null,
      });
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "PRD drafted",
      });
    });

    return { outcome: "prd-drafted" };
  },
);
