import { z } from "zod";
import { generateStructured } from "./structured";
import { models } from "./models";
import type { GeneratedPrd } from "./prd";
import type { ReviewFinding } from "./review";

export const releaseReadinessSchema = z.object({
  ready: z
    .boolean()
    .describe(
      "true only if the implementation genuinely satisfies the feature's intent " +
        "and is safe to ship now; false if real concerns remain.",
    ),
  rationale: z
    .string()
    .describe(
      "A few sentences explaining WHY it is or isn't ready — lead with the " +
        "verdict, then the reasoning tied to the PRD, acceptance criteria, and " +
        "review outcome. Actionable, never a bare score.",
    ),
  risks: z
    .array(z.string())
    .describe(
      "The key risks or outstanding concerns the human reviewer should weigh " +
        "before deciding. Empty only if nothing meaningful remains.",
    ),
});

export type GeneratedReleaseReadiness = z.infer<typeof releaseReadinessSchema>;

/** One past AI review run, summarised for the readiness assessment. */
export type ReadinessReviewRun = {
  summary: string;
  blockingCount: number;
  nonBlockingCount: number;
};

const READINESS_SYSTEM = `You are a release manager deciding whether a feature is \
ready to ship. A separate AI QA review has already judged the code; your job is \
NOT to re-review the diff but to weigh the whole picture and advise the human \
who makes the final call.

Decide readiness from:
- the PRD's problem, goals, and acceptance criteria — is the intended outcome delivered?
- the AI review history — did blocking issues get resolved across the fix loop, or do concerns linger?
- the outstanding (non-blocking) findings the latest review left open — are any risky enough to give a reviewer pause?

Rules:
- A feature only reaches this gate with no blocking findings, so "ready" is the \
common case — but say so for the right reasons, not by default.
- Mark it not-ready when outstanding concerns are serious enough that a thoughtful \
reviewer would want them addressed first; explain which ones and why.
- Ground every statement in the PRD and review data provided. Never invent issues.
- Be specific and actionable so the human can act on your rationale, not just read a verdict.`;

function list(label: string, items: string[]): string {
  return items.length
    ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}`
    : "";
}

function renderPrd(prd: GeneratedPrd): string {
  return [
    `PROBLEM:\n${prd.problemStatement}`,
    list("GOALS", prd.goals),
    list("ACCEPTANCE CRITERIA", prd.acceptanceCriteria),
    list("EDGE CASES", prd.edgeCases),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderReviews(runs: ReadinessReviewRun[]): string {
  if (runs.length === 0) return "(no AI review has run)";
  // Newest first — the latest verdict leads, earlier runs show the fix-loop trail.
  return runs
    .map(
      (r, i) =>
        `${i === 0 ? "LATEST" : `Run ${runs.length - i}`} — ` +
        `${r.blockingCount} blocking, ${r.nonBlockingCount} non-blocking\n   ${r.summary}`,
    )
    .join("\n");
}

function renderOutstanding(findings: ReviewFinding[]): string {
  if (findings.length === 0) return "(none — the latest review left nothing open)";
  return findings
    .map((f) => `- ${f.title} (${f.dimension}): ${f.recommendation}`)
    .join("\n");
}

/**
 * Assess whether a feature is ready to ship, grounded in its PRD, its AI review
 * history (newest first), and the outstanding non-blocking findings. Returns a
 * structured ready/not-ready verdict with a rationale and the key risks.
 */
export async function assessReleaseReadiness(input: {
  prd: GeneratedPrd;
  reviews: ReadinessReviewRun[];
  outstandingFindings: ReviewFinding[];
}): Promise<GeneratedReleaseReadiness> {
  const prompt = [
    renderPrd(input.prd),
    `AI REVIEW HISTORY:\n${renderReviews(input.reviews)}`,
    `OUTSTANDING (NON-BLOCKING) FINDINGS:\n${renderOutstanding(input.outstandingFindings)}`,
    "Assess this feature's release readiness and report your verdict.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateStructured({
    schema: releaseReadinessSchema,
    model: models.releaseReadiness,
    system: READINESS_SYSTEM,
    prompt,
  });
}
