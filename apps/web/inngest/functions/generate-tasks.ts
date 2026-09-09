import {
  createTask,
  getPrd,
  listTasksByPrd,
  setTaskDependsOn,
  updateFeatureRequestStatus,
  updateWorkflowRun,
} from "@throughline/db";
import { generateTasks } from "@throughline/ai";
import { EVENTS } from "@throughline/api";
import { inngest } from "../client";

/**
 * When a PRD is approved, decompose it into engineering tasks and lay
 * them out for the Kanban board.
 *
 *   load PRD ─ already has tasks? → stop (idempotent)
 *            └ generate vertical-slice tasks → persist → map dependsOn keys to
 *              real ids → advance the request to "tasks-planned"
 *
 * Keyed on the feature request so the existing per-request progress UI shows
 * the run. Each step is crash-safe via Inngest's step memoization.
 */
export const generateTasksFunction = inngest.createFunction(
  { id: "generate-tasks", triggers: [{ event: EVENTS.prdApproved }] },
  async ({ event, step }) => {
    const { workspaceId, prdId, featureRequestId, workflowRunId } =
      event.data as {
        workspaceId: string;
        prdId: string;
        featureRequestId: string;
        workflowRunId: string;
      };

    const prd = await step.run("load-prd", async () => {
      await updateWorkflowRun(workflowRunId, {
        status: "running",
        currentStep: "Reading the PRD",
      });
      return getPrd(workspaceId, prdId);
    });

    if (!prd) {
      await updateWorkflowRun(workflowRunId, {
        status: "failed",
        currentStep: "PRD not found",
      });
      return { outcome: "not-found" };
    }

    // Idempotency: re-delivered events must not double-generate. If this PRD
    // already has tasks, ensure the request is marked planned and stop.
    const existing = await step.run("check-existing", () =>
      listTasksByPrd(workspaceId, prdId),
    );
    if (existing.length > 0) {
      await step.run("mark-planned", async () => {
        await updateFeatureRequestStatus(workspaceId, featureRequestId, {
          status: "tasks-planned",
        });
        await updateWorkflowRun(workflowRunId, {
          status: "succeeded",
          currentStep: "Task plan ready",
        });
      });
      return { outcome: "already-planned", count: existing.length };
    }

    const generated = await step.run("generate-tasks", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Breaking the PRD into tasks",
      });
      return generateTasks({
        problemStatement: prd.problemStatement,
        goals: prd.goals,
        nonGoals: prd.nonGoals,
        userStories: prd.userStories,
        acceptanceCriteria: prd.acceptanceCriteria,
        edgeCases: prd.edgeCases,
        successMetrics: prd.successMetrics,
      });
    });

    await step.run("persist-tasks", async () => {
      await updateWorkflowRun(workflowRunId, {
        currentStep: "Saving the task plan",
      });

      // First pass: insert every task (without dependencies) in plan order,
      // recording each batch-local key → real id.
      const keyToId = new Map<string, string>();
      const created: { id: string; dependsOnKeys: string[] }[] = [];
      for (let i = 0; i < generated.length; i++) {
        const t = generated[i];
        const row = await createTask(workspaceId, {
          prdId,
          featureRequestId,
          title: t.title,
          description: t.description,
          requirementRefs: t.requirementRefs,
          status: "todo",
          orderIndex: i,
          // 1-based stable identifier in plan order.
          seq: i + 1,
        });
        keyToId.set(t.key, row.id);
        created.push({ id: row.id, dependsOnKeys: t.dependsOn });
      }

      // Second pass: resolve dependsOn keys to real ids now that all exist.
      for (const c of created) {
        const ids = c.dependsOnKeys
          .map((k) => keyToId.get(k))
          .filter((id): id is string => Boolean(id) && id !== c.id);
        if (ids.length > 0) {
          await setTaskDependsOn(workspaceId, c.id, ids);
        }
      }

      await updateFeatureRequestStatus(workspaceId, featureRequestId, {
        status: "tasks-planned",
      });
      await updateWorkflowRun(workflowRunId, {
        status: "succeeded",
        currentStep: "Task plan ready",
      });
    });

    return { outcome: "tasks-planned", count: generated.length };
  },
);
