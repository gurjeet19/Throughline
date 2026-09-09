import { z } from "zod";
import { generateStructured } from "./structured";
import { models } from "./models";
import type { GeneratedPrd } from "./prd";

/**
 * The seven dimensions a QA review must cover, straight from the product spec.
 * Stored on each finding so the UI can group by dimension.
 */
export const REVIEW_DIMENSIONS = [
  "requirements",
  "acceptance-criteria",
  "tasks",
  "security",
  "performance",
  "edge-cases",
  "code-quality",
] as const;

export const reviewFindingSchema = z.object({
  dimension: z
    .enum(REVIEW_DIMENSIONS)
    .describe("Which review dimension this finding belongs to."),
  severity: z
    .enum(["blocking", "non-blocking"])
    .describe(
      "blocking = must be fixed before this can ship (a real defect, a missed " +
        "requirement/acceptance criterion, a security/data-loss risk). " +
        "non-blocking = advisory improvement that does not block release.",
    ),
  title: z.string().describe("A short, specific headline for the issue."),
  explanation: z
    .string()
    .describe("Why this is an issue — the product/engineering reasoning, grounded in the diff."),
  recommendation: z
    .string()
    .describe("Concrete, actionable guidance on how to resolve it."),
  file: z
    .string()
    .nullable()
    .describe("The changed file this refers to, or null if it spans the change."),
  line: z
    .number()
    .nullable()
    .describe("An approximate line in that file, or null if not pinpointable."),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

const reviewSchema = z.object({
  summary: z
    .string()
    .describe(
      "A few sentences: does this implementation satisfy the feature's intent " +
        "and is it production-ready? Lead with the verdict, then the why.",
    ),
  findings: z
    .array(reviewFindingSchema)
    .describe(
      "Every issue found, across all seven dimensions. Empty only if the change " +
        "genuinely has no issues worth raising.",
    ),
});

export type GeneratedReview = z.infer<typeof reviewSchema>;

export type ReviewTask = {
  seq: number;
  title: string;
  description: string;
  requirementRefs: string[];
};

export type ReviewDiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
};

const REVIEW_SYSTEM = `You are a senior QA and engineering reviewer judging a \
pull request before it ships. You are NOT a syntax checker. Your job is to \
decide whether the implementation genuinely satisfies the product requirements \
and is production-ready.

Evaluate the diff across all seven dimensions, and attribute every finding to one:
- requirements: does it actually deliver what the PRD's problem/goals describe?
- acceptance-criteria: is each acceptance criterion met by this code? Call out any that are not.
- tasks: are the engineering tasks implemented? Flag missing or partial ones.
- security: injection, authz/tenant-isolation gaps, secret handling, unsafe input.
- performance: needless work, N+1s, blocking calls, unbounded growth.
- edge-cases: failure modes and boundary conditions the PRD lists or the code ignores.
- code-quality: correctness bugs, readability, and maintainability that matter.

Rules:
- Ground every finding in the ACTUAL diff provided. Never invent code that isn't shown.
- Classify each finding as blocking or non-blocking, and explain WHY it matters \
(tie requirement/acceptance-criteria findings back to the specific item).
- Give actionable, specific recommendations — not vague advice.
- A missed acceptance criterion or an unimplemented task is normally blocking.
- If the change is solid, say so in the summary and keep findings to genuine issues; \
do not manufacture problems.
- If you are told the diff was reduced to fit, review what you can see and note any \
uncertainty in the summary rather than guessing about omitted parts.

Re-review discipline (when a previous round's findings are provided):
- This is a follow-up review of a change that was revised to address earlier blocking \
findings. For each prior finding, judge from THIS diff whether it is now resolved; \
say so in the summary.
- Do NOT re-raise a prior finding that the new code resolves, and do NOT restate the \
same issue in different words. Only carry a prior finding forward if it is genuinely \
still unaddressed in this diff.
- Hold NEW blocking findings to a high bar: raise one only for a real defect, a \
regression the fix introduced, or a requirement/acceptance-criterion that is still \
unmet — not for fresh stylistic preferences. The goal is to converge, not to find \
something new every round.`;

function list(label: string, items: string[]): string {
  return items.length
    ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}`
    : "";
}

function renderPrd(prd: GeneratedPrd): string {
  return [
    `PROBLEM:\n${prd.problemStatement}`,
    list("GOALS", prd.goals),
    list("NON-GOALS", prd.nonGoals),
    list("ACCEPTANCE CRITERIA", prd.acceptanceCriteria),
    list("EDGE CASES", prd.edgeCases),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderTasks(tasks: ReviewTask[]): string {
  if (tasks.length === 0) return "(no tasks recorded)";
  return tasks
    .map(
      (t) =>
        `#${t.seq} ${t.title}\n   ${t.description}` +
        (t.requirementRefs.length
          ? `\n   Satisfies: ${t.requirementRefs.join("; ")}`
          : ""),
    )
    .join("\n");
}

function renderFiles(files: ReviewDiffFile[]): string {
  if (files.length === 0) return "(no changed files reported)";
  return files
    .map((f) => `- ${f.filename} (${f.status}, +${f.additions} −${f.deletions})`)
    .join("\n");
}

function renderPriorFindings(findings: ReviewFinding[]): string {
  const blocking = findings.filter((f) => f.severity === "blocking");
  if (blocking.length === 0) return "";
  const lines = blocking.map((f, i) => {
    const where = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : "";
    return `${i + 1}. [${f.dimension}]${where} ${f.title}\n   ${f.recommendation}`;
  });
  return (
    "PREVIOUS REVIEW — BLOCKING FINDINGS the change was revised to fix. For each, " +
    "decide from this diff whether it is now resolved:\n" +
    lines.join("\n")
  );
}

/**
 * Run a QA review of a pull request against its PRD, tasks, and the unified
 * diff. The full changed-file list is always included so scope is visible even
 * when `diff` was clipped to fit the model — `truncated` tells the model it is
 * seeing a reduced view so it can flag the limitation rather than guess.
 *
 * `priorFindings` (the previous round's findings, when this is a re-review) lets
 * the model verify earlier blockers were addressed instead of judging the diff
 * cold each round — the convergence guard against an endless fix loop.
 */
export async function reviewPullRequest(input: {
  prd: GeneratedPrd;
  tasks: ReviewTask[];
  files: ReviewDiffFile[];
  diff: string;
  truncated: boolean;
  priorFindings?: ReviewFinding[];
}): Promise<GeneratedReview> {
  const prompt = [
    renderPrd(input.prd),
    `ENGINEERING TASKS:\n${renderTasks(input.tasks)}`,
    `CHANGED FILES:\n${renderFiles(input.files)}`,
    input.priorFindings ? renderPriorFindings(input.priorFindings) : "",
    input.truncated
      ? "NOTE: the unified diff below was reduced to fit. Review what is shown; " +
        "the changed-file list above is complete."
      : "",
    `UNIFIED DIFF:\n${input.diff || "(empty diff)"}`,
    "Review this pull request and report your findings.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateStructured({
    schema: reviewSchema,
    model: models.review,
    system: REVIEW_SYSTEM,
    prompt,
  });
}
