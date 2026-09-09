import {
  getFeatureRequest,
  getGithubInstallation,
  getLatestPrdForRequest,
  getRepository,
  listTasksByFeatureRequest,
  updateAgentProposal,
  updateWorkflowRun,
} from "@throughline/db";
import { generateCodeChanges, type RepoFile } from "@throughline/ai";
import { getFileContent, getRepoTree } from "@throughline/github";
import { EVENTS } from "@throughline/api";
import { inngest } from "../client";

// Keep the context the model sees bounded: only text-like files, each under a
// size cap, up to a total budget — a small repo loads fully, a large one loads a
// relevant-by-extension subset rather than everything.
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|html|md|mdx|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sh|yml|yaml|toml|sql|txt|vue|svelte)$/i;
const SKIP_PATH =
  /(^|\/)(node_modules|dist|build|\.next|\.git|coverage|vendor)\//;
const MAX_FILE_BYTES = 50_000;
const MAX_TOTAL_BYTES = 400_000;
const MAX_FILES = 40;

/**
 * Throughline coding agent: read the feature's PRD, tasks, and relevant repo
 * files, generate proposed code changes, and store them as a preview for human
 * review. Commits nothing — a confirm step (in the API) does the actual commit.
 * Keyed on the proposal so the agent panel can poll its status.
 */
export const generateCodeFunction = inngest.createFunction(
  { id: "generate-code", triggers: [{ event: EVENTS.agentCodegenRequested }] },
  async ({ event, step }) => {
    const { workspaceId, featureRequestId, proposalId, workflowRunId, feedback } =
      event.data as {
        workspaceId: string;
        featureRequestId: string;
        proposalId: string;
        workflowRunId: string;
        feedback?: string;
      };

    const fail = async (message: string) => {
      await updateAgentProposal(proposalId, { status: "failed", error: message });
      await updateWorkflowRun(workflowRunId, {
        status: "failed",
        currentStep: message,
      });
    };

    const context = await step.run("gather-context", async () => {
      await updateWorkflowRun(workflowRunId, {
        status: "running",
        currentStep: "Reading the PRD and tasks",
      });
      await updateAgentProposal(proposalId, {
        currentStep: "Reading the PRD and tasks",
      });
      const feature = await getFeatureRequest(workspaceId, featureRequestId);
      const prd = await getLatestPrdForRequest(workspaceId, featureRequestId);
      const tasks = await listTasksByFeatureRequest(workspaceId, featureRequestId);
      const repo = feature?.repositoryId
        ? await getRepository(workspaceId, feature.repositoryId)
        : null;
      const installation = await getGithubInstallation(workspaceId);
      return { feature, prd, tasks, repo, installation };
    });

    if (
      !context.feature?.developmentBranch ||
      !context.prd ||
      !context.repo ||
      !context.installation
    ) {
      await fail("Feature, PRD, or repository is unavailable");
      return { outcome: "not-ready" };
    }

    const { feature, prd, tasks, repo, installation } = context;
    const installationId = Number(installation.installationId);
    const branch = context.feature.developmentBranch;

    const files = await step.run("read-repo-files", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Reading repository files",
      });
      await updateAgentProposal(proposalId, {
        currentStep: "Reading repository files",
      });
      const tree = await getRepoTree(installationId, repo.owner, repo.name, branch);
      const candidates = tree
        .filter((t) => TEXT_EXT.test(t.path) && !SKIP_PATH.test(t.path))
        .filter((t) => t.size > 0 && t.size <= MAX_FILE_BYTES)
        .sort((a, b) => a.size - b.size);

      const loaded: RepoFile[] = [];
      let total = 0;
      for (const entry of candidates) {
        if (loaded.length >= MAX_FILES || total + entry.size > MAX_TOTAL_BYTES) break;
        const content = await getFileContent(
          installationId,
          repo.owner,
          repo.name,
          branch,
          entry.path,
        );
        if (content !== null) {
          loaded.push({ path: entry.path, content });
          total += entry.size;
        }
      }
      return loaded;
    });

    const generated = await step.run("generate-changes", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Generating code changes",
      });
      await updateAgentProposal(proposalId, {
        currentStep: "Generating code changes",
      });
      return generateCodeChanges({
        prd: {
          problemStatement: prd.problemStatement,
          goals: prd.goals,
          nonGoals: prd.nonGoals,
          userStories: prd.userStories,
          acceptanceCriteria: prd.acceptanceCriteria,
          edgeCases: prd.edgeCases,
          successMetrics: prd.successMetrics,
        },
        tasks: tasks.map((t) => ({
          title: t.title,
          description: t.description,
          requirementRefs: t.requirementRefs,
        })),
        files,
        feedback,
      });
    });

    await step.run("store-proposal", async () => {
      // Attach the captured old contents so the review diff is stable and the
      // commit step has the exact base it was generated against.
      const byPath = new Map(files.map((f) => [f.path, f.content]));
      const changes = generated.changes.map((c) => ({
        path: c.path,
        action: c.action,
        oldContent: c.action === "create" ? "" : byPath.get(c.path) ?? "",
        newContent: c.action === "delete" ? "" : c.newContent,
        rationale: c.rationale,
      }));
      await updateAgentProposal(proposalId, {
        status: "ready",
        currentStep: null,
        summary: generated.summary,
        changes,
      });
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Proposal ready for review",
      });
    });

    return { outcome: "ready", changes: generated.changes.length };
  },
);
