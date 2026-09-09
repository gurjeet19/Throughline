import { z } from "zod";
import { generateStructured } from "./structured";
import { models } from "./models";
import type { ClarificationEntry } from "./triage";

/**
 * A structured PRD covering the seven sections the product spec mandates.
 * Each list section holds concise, self-contained bullet strings.
 */
export const prdSchema = z.object({
  problemStatement: z
    .string()
    .describe("2-4 sentences framing the problem and who has it."),
  goals: z.array(z.string()).describe("What this feature must achieve."),
  nonGoals: z
    .array(z.string())
    .describe("Explicitly out of scope, to prevent drift."),
  userStories: z
    .array(z.string())
    .describe('"As a <role>, I want <capability>, so that <benefit>." strings.'),
  acceptanceCriteria: z
    .array(z.string())
    .describe("Observable, testable conditions that define done."),
  edgeCases: z
    .array(z.string())
    .describe("Failure modes and boundary conditions to handle."),
  successMetrics: z
    .array(z.string())
    .describe("How success is measured once shipped."),
});

export type GeneratedPrd = z.infer<typeof prdSchema>;

const PRD_SYSTEM = `You are a senior product manager writing a precise, \
implementation-ready PRD from a feature request and its clarifying Q&A. Write \
for an engineering team. Be specific and grounded in the provided context — do \
not invent requirements that were never discussed. Every section must be \
populated; keep bullets concise and self-contained.`;

function renderHistory(history: ClarificationEntry[]): string {
  const answered = history.filter((h) => h.answer !== null);
  if (answered.length === 0) return "(no clarification was needed)";
  return answered
    .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`)
    .join("\n");
}

export async function generatePrd(input: {
  rawContent: string;
  clarificationHistory: ClarificationEntry[];
}): Promise<GeneratedPrd> {
  const prompt = `FEATURE REQUEST:
${input.rawContent}

CLARIFYING Q&A:
${renderHistory(input.clarificationHistory)}

Write the complete PRD.`;

  return generateStructured({
    schema: prdSchema,
    model: models.prd,
    system: PRD_SYSTEM,
    prompt,
  });
}
