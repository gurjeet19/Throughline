import { z } from "zod";
import { generateStructured } from "./structured";
import { models } from "./models";
import type { GeneratedPrd } from "./prd";

/**
 * One generated engineering task. `key` is a batch-local identifier the model
 * uses to express dependencies between tasks in the same plan; it is NOT
 * persisted — the workflow maps each `key` to the real task id after insert.
 */
export const generatedTaskSchema = z.object({
  key: z
    .string()
    .describe(
      "Short, stable, unique-within-this-plan slug for this task (e.g. " +
        "'submit-form', 'list-view'). Used only to declare dependencies.",
    ),
  title: z
    .string()
    .describe("Imperative, specific title naming a complete capability."),
  description: z
    .string()
    .describe(
      "What this slice delivers end-to-end and how it is verified. 2-4 " +
        "sentences. Describe behavior, not a layer of implementation.",
    ),
  requirementRefs: z
    .array(z.string())
    .describe(
      "The PRD acceptance criteria / user stories this task satisfies, quoted " +
        "or closely paraphrased, for traceability.",
    ),
  dependsOn: z
    .array(z.string())
    .describe(
      "Keys of other tasks in this plan that must land first. Express " +
        "slice-on-slice ordering, never layer ordering. Usually empty or one.",
    ),
});

export type GeneratedTask = z.infer<typeof generatedTaskSchema>;

const tasksSchema = z.object({
  tasks: z
    .array(generatedTaskSchema)
    .describe("The ordered engineering plan, 4-10 tasks."),
});

const TASKS_SYSTEM = `You are a staff engineer turning an approved PRD into an \
engineering plan for the team.

Decompose the PRD into TRACER-BULLET tasks: thin VERTICAL slices that each cut \
through every layer they need (schema, API, UI, tests) and are independently \
demoable or verifiable. A good task reads as a narrow but complete capability — \
"a user can <do X>". NEVER produce horizontal layer tasks such as "build the \
database schema", "build the API", or "build the UI"; that is the wrong shape \
and will be rejected.

Ground every task in the PRD's goals, user stories, acceptance criteria, and \
edge cases — do not invent scope that was not specified. Order tasks so the \
thinnest end-to-end slice comes first and later slices build on it. Use \
'dependsOn' only for genuine slice-on-slice prerequisites (keep it minimal). \
Produce between 4 and 10 tasks.`;

function renderPrd(prd: GeneratedPrd): string {
  const list = (label: string, items: string[]) =>
    items.length ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : "";
  return [
    `PROBLEM:\n${prd.problemStatement}`,
    list("GOALS", prd.goals),
    list("NON-GOALS", prd.nonGoals),
    list("USER STORIES", prd.userStories),
    list("ACCEPTANCE CRITERIA", prd.acceptanceCriteria),
    list("EDGE CASES", prd.edgeCases),
    list("SUCCESS METRICS", prd.successMetrics),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Decompose an approved PRD into a vertical-slice engineering plan. Returns the
 * tasks in execution order; `dependsOn` references sibling tasks by their
 * batch-local `key`.
 */
export async function generateTasks(prd: GeneratedPrd): Promise<GeneratedTask[]> {
  const { tasks } = await generateStructured({
    schema: tasksSchema,
    model: models.tasks,
    system: TASKS_SYSTEM,
    prompt: `${renderPrd(prd)}\n\nProduce the engineering plan.`,
  });
  return tasks;
}
