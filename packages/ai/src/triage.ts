import { z } from "zod";
import { generateStructured } from "./structured";
import { models } from "./models";

/** Mirrors `ClarificationEntry` in @throughline/db (kept local to avoid coupling). */
export type ClarificationEntry = {
  question: string;
  answer: string | null;
  askedAt: string;
};

/**
 * Triage decision for an incoming feature request. This is the "AI product
 * thinking" gate that sits before any PRD work:
 *
 * - `exists`   — the requested capability already exists in the workspace.
 *                We educate the requester instead of building it again.
 * - `clarify`  — the request is missing context. We ask follow-up questions
 *                and wait for the human to answer before re-triaging.
 * - `ready`    — the request is genuinely new and well-specified enough to
 *                turn into a PRD.
 * - `flagged`  — the request is too ambiguous to spec even after asking, and
 *                needs human attention rather than a low-confidence PRD.
 */
export const triageDecisionSchema = z.object({
  decision: z.enum(["exists", "clarify", "ready", "flagged"]),
  note: z
    .string()
    .describe(
      "When 'exists': a friendly explanation of what already covers this, so " +
        "the requester is educated. When 'flagged': why it can't be specified. " +
        "Otherwise a one-line rationale.",
    ),
  questions: z
    .array(z.string())
    .describe(
      "Only when decision is 'clarify': 2-4 specific follow-up questions whose " +
        "answers would unblock writing a complete PRD. Empty otherwise.",
    ),
});

export type TriageDecision = z.infer<typeof triageDecisionSchema>;

const TRIAGE_SYSTEM = `You are the product-intake reviewer for a software \
delivery platform. A feature request arrives; you decide what happens next \
BEFORE any specification work begins. You think like a senior product manager, \
not a syntax checker.

Apply these rules in order:
1. EXISTS: Choose "exists" ONLY IF a specific item listed in the "existing \
capabilities in this workspace" catalog clearly covers this request. Your note \
MUST quote that exact catalog item. NEVER use general knowledge about what other \
apps or products commonly have — a feature being common in the industry is NOT a \
reason to mark it as existing. If the catalog is empty or contains no matching \
item, the capability does NOT exist here. If an item only PARTIALLY covers it, \
prefer "clarify" or "ready" scoped to the genuinely missing part, and say so.
2. CLARIFY: If the request is missing context needed for a complete PRD (who \
needs it, the problem, success criteria, scope), choose "clarify" and ask 2-4 \
targeted questions. Only ask for what is actually missing. This is the correct \
choice for a thin or under-specified request — ask, do not escalate.
3. FLAGGED: Choose "flagged" ONLY when the clarification limit has been reached \
and the request is STILL too vague to specify. Never flag a request on an early \
round just because it lacks detail — clarify it instead.
4. READY: If the request is new and specified well enough to write a PRD, \
choose "ready".

Be decisive. Prefer "ready" once you have enough to write a useful PRD — do \
not loop on clarification forever.`;

function renderHistory(history: ClarificationEntry[]): string {
  const answered = history.filter((h) => h.answer !== null);
  if (answered.length === 0) return "(none yet)";
  return answered
    .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`)
    .join("\n");
}

function renderCatalog(catalog: {
  requests: { rawContent: string; status: string }[];
  prds: { problemStatement: string }[];
}): string {
  const items = [
    ...catalog.requests.map((r) => `- ${r.rawContent.split("\n")[0]}`),
    ...catalog.prds
      .filter((p) => p.problemStatement.trim().length > 0)
      .map((p) => `- ${p.problemStatement.split("\n")[0]}`),
  ];
  return items.length > 0 ? items.join("\n") : "(workspace has no prior requests or PRDs yet)";
}

export async function triageRequest(input: {
  rawContent: string;
  clarificationHistory: ClarificationEntry[];
  catalog: {
    requests: { rawContent: string; status: string }[];
    prds: { problemStatement: string }[];
  };
  /** How many clarification rounds have already happened. */
  round: number;
  /** Force a terminal decision (ready/flagged) once this is exceeded. */
  maxRounds: number;
}): Promise<TriageDecision> {
  const { rawContent, clarificationHistory, catalog, round, maxRounds } = input;

  const exhausted = round >= maxRounds;
  const prompt = `FEATURE REQUEST:
${rawContent}

PRIOR CLARIFICATION (answered):
${renderHistory(clarificationHistory)}

EXISTING CAPABILITIES IN THIS WORKSPACE:
${renderCatalog(catalog)}

This is clarification round ${round} of a maximum ${maxRounds}.${
    exhausted
      ? ' You have reached the clarification limit: you may NOT choose "clarify". ' +
        'Choose "ready" if you can write a reasonable PRD, otherwise "flagged".'
      : ' You have NOT reached the clarification limit: you may NOT choose ' +
        '"flagged". If the request lacks context, choose "clarify" and ask ' +
        "questions; otherwise choose \"exists\" or \"ready\"."
  }`;

  const result = await generateStructured({
    schema: triageDecisionSchema,
    model: models.triage,
    system: TRIAGE_SYSTEM,
    prompt,
  });

  // Guard: never allow an endless clarify loop even if the model ignores the
  // instruction above.
  if (exhausted && result.decision === "clarify") {
    return {
      decision: "ready",
      note: "Proceeding to PRD after reaching the clarification limit.",
      questions: [],
    };
  }

  // Guard: flagging is reserved for after the clarification limit. On an early
  // round, an under-specified request must be clarified, not escalated — so a
  // premature "flagged" becomes "clarify" when the model gave questions, else we
  // proceed to a PRD rather than dead-ending the request.
  if (!exhausted && result.decision === "flagged") {
    return result.questions.length > 0
      ? { ...result, decision: "clarify" }
      : { decision: "ready", note: result.note, questions: [] };
  }

  return result;
}
