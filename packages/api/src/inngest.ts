import { Inngest } from "inngest";

/**
 * Event-sender client. Shares the app id ("throughline") with the function
 * host in apps/web, so events sent here are routed to the functions served at
 * the web app's /api/inngest endpoint.
 */
export const inngest = new Inngest({ id: "throughline" });

/** Canonical event names, shared between the sender (here) and the handlers. */
export const EVENTS = {
  requestSubmitted: "throughline/request.submitted",
  prdApproved: "throughline/prd.approved",
  prDiffRequested: "throughline/pr.diff.requested",
  prReviewRequested: "throughline/pr.review.requested",
  agentCodegenRequested: "throughline/agent.codegen.requested",
  fixTasksRequested: "throughline/fix-tasks.requested",
  releaseReadinessRequested: "throughline/release-readiness.requested",
} as const;

export type RequestSubmittedEvent = {
  name: typeof EVENTS.requestSubmitted;
  data: {
    workspaceId: string;
    featureRequestId: string;
    workflowRunId: string;
  };
};

export type PrdApprovedEvent = {
  name: typeof EVENTS.prdApproved;
  data: {
    workspaceId: string;
    prdId: string;
    featureRequestId: string;
    workflowRunId: string;
  };
};

export type PrDiffRequestedEvent = {
  name: typeof EVENTS.prDiffRequested;
  data: {
    workspaceId: string;
    pullRequestId: string;
    workflowRunId: string;
  };
};

export type PrReviewRequestedEvent = {
  name: typeof EVENTS.prReviewRequested;
  data: {
    workspaceId: string;
    pullRequestId: string;
    reviewId: string;
    workflowRunId: string;
  };
};

export type AgentCodegenRequestedEvent = {
  name: typeof EVENTS.agentCodegenRequested;
  data: {
    workspaceId: string;
    featureRequestId: string;
    proposalId: string;
    workflowRunId: string;
    feedback?: string;
  };
};

export type FixTasksRequestedEvent = {
  name: typeof EVENTS.fixTasksRequested;
  data: {
    workspaceId: string;
    featureRequestId: string;
    reviewId: string;
    workflowRunId: string;
  };
};

export type ReleaseReadinessRequestedEvent = {
  name: typeof EVENTS.releaseReadinessRequested;
  data: {
    workspaceId: string;
    featureRequestId: string;
    readinessId: string;
    workflowRunId: string;
  };
};
