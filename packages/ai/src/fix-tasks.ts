import { z } from "zod";
import { generateStructured } from "./structured";
import { models } from "./models";
import type { GeneratedPrd } from "./prd";
import type { ReviewFinding } from "./review";

/**
 * One generated fix task. Unlike a feature task it carries no batch-local `key`
 * or dependencies — fixes are independent remediation items, each addressing one
 * or more blocking findings from a review run.
 */
export const generatedFixTaskSchema = z.object({
  title: z
    .string()
    .describe(
      "Imperative, specific title naming the fix (e.g. 'Persist theme " +
        "choice across reloads'). Names the remediation, not the symptom.",
    ),
  description: z
    .string()
    .describe(
      "What is wrong and what 'fixed' looks like — the concrete change and how " +
        "it is verified. 2-4 sentences. Describe behavior and outcome, not a " +
        "layer of implementation.",
    ),
  requirementRefs: z
    .array(z.string())
    .describe(
      "The review dimensions or PRD acceptance criteria this fix restores " +
        "(e.g. 'acceptance-criteria: choice persists', 'security'), for " +
        "traceability back to the finding.",
    ),
});

export type GeneratedFixTask = z.infer<typeof generatedFixTaskSchema>;

const fixTasksSchema = z.object({
  tasks: z
    .array(generatedFixTaskSchema)
    .describe(
      "The remediation plan: one task per distinct blocking issue (closely " +
        "related findings may be merged into one task). Ordered most critical " +
        "first.",
    ),
});

const FIX_TASKS_SYSTEM = `You are a staff engineer turning an AI code review's \
BLOCKING findings into a focused remediation plan for the team.

You are given the feature's PRD context, the engineering tasks that were already \
built, and the blocking findings from the latest review of the pull request. \
Produce a short list of fix tasks that, once done, would resolve every blocking \
finding so the change can pass re-review.

Rules:
- Cover EVERY blocking finding. Merge findings that share one root cause into a \
single task; otherwise one task per finding.
- Each task is a concrete remediation a developer (or coding agent) can pick up \
and verify — name the fix and its expected outcome, grounded in the finding's \
recommendation. Never restate the symptom without a fix.
- Do NOT invent scope beyond resolving the findings. Non-blocking advisories are \
NOT in scope — ignore them.
- Order tasks most critical first.`;

function renderPrd(prd: GeneratedPrd): string {
  const list = (label: string, items: string[]) =>
    items.length ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : "";
  return [
    `PROBLEM:\n${prd.problemStatement}`,
    list("GOALS", prd.goals),
    list("ACCEPTANCE CRITERIA", prd.acceptanceCriteria),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderFindings(findings: ReviewFinding[]): string {
  return findings
    .map((f, i) => {
      const where = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : "";
      return (
        `${i + 1}. [${f.dimension}]${where} ${f.title}\n` +
        `   Why: ${f.explanation}\n` +
        `   Recommended fix: ${f.recommendation}`
      );
    })
    .join("\n");
}

/**
 * Turn a review's blocking findings into a remediation plan. Grounded entirely
 * in the findings (and PRD context for orientation) — nothing hardcoded. Returns
 * the fix tasks most-critical-first; the workflow persists them as `kind: 'fix'`
 * tasks on the feature's board.
 */
export async function generateFixTasks(input: {
  prd: GeneratedPrd;
  findings: ReviewFinding[];
}): Promise<GeneratedFixTask[]> {
  const { tasks } = await generateStructured({
    schema: fixTasksSchema,
    model: models.tasks,
    system: FIX_TASKS_SYSTEM,
    prompt: [
      renderPrd(input.prd),
      `BLOCKING FINDINGS FROM THE LATEST REVIEW:\n${renderFindings(input.findings)}`,
      "Produce the remediation plan.",
    ].join("\n\n"),
  });
  return tasks;
}
