import { z } from "zod";
import { generateStructured } from "./structured";
import { models } from "./models";
import type { GeneratedPrd } from "./prd";

/**
 * One proposed file change. The model returns the full intended file contents
 * for create/modify (a whole-file rewrite is simpler and less error-prone than
 * patch hunks); `newContent` is empty for a delete. `oldContent` is filled in by
 * the caller from the files it loaded, so the model never has to echo it back.
 */
export const codeChangeSchema = z.object({
  path: z
    .string()
    .describe("Repository-root-relative file path, POSIX separators."),
  action: z
    .enum(["create", "modify", "delete"])
    .describe("create a new file, modify an existing one, or delete it."),
  newContent: z
    .string()
    .describe(
      "The complete new contents of the file for create/modify. Empty for " +
        "delete. Always the WHOLE file, not a fragment.",
    ),
  rationale: z
    .string()
    .describe("One or two sentences: why this change, tied to a task/criterion."),
});

export type CodeChange = z.infer<typeof codeChangeSchema>;

const codeChangesSchema = z.object({
  summary: z
    .string()
    .describe("A short paragraph describing the implementation approach."),
  changes: z
    .array(codeChangeSchema)
    .describe("The file changes that implement the feature."),
});

export type GeneratedCodeChanges = z.infer<typeof codeChangesSchema>;

export type CodegenTask = {
  title: string;
  description: string;
  requirementRefs: string[];
};

export type RepoFile = { path: string; content: string };

const CODEGEN_SYSTEM = `You are a senior engineer implementing an approved \
feature directly in an existing repository.

You are given the PRD, the engineering tasks, and the current contents of the \
repository files most relevant to the work. Implement the tasks by editing those \
files and adding new ones as needed.

Rules:
- Return the COMPLETE new contents of every file you create or modify — never a \
diff, patch, or fragment.
- Only touch files that the feature genuinely requires; do not reformat or \
rewrite unrelated files.
- Match the existing code's language, style, structure, and conventions as seen \
in the provided files.
- Ground every change in the PRD and tasks; do not invent unspecified scope.
- Prefer a small, coherent set of changes that a reviewer can read. For each \
change give a brief rationale tied to a task or acceptance criterion.`;

function renderPrd(prd: GeneratedPrd): string {
  const list = (label: string, items: string[]) =>
    items.length ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : "";
  return [
    `PROBLEM:\n${prd.problemStatement}`,
    list("GOALS", prd.goals),
    list("ACCEPTANCE CRITERIA", prd.acceptanceCriteria),
    list("EDGE CASES", prd.edgeCases),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderTasks(tasks: CodegenTask[]): string {
  return tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.title}\n   ${t.description}` +
        (t.requirementRefs.length
          ? `\n   Satisfies: ${t.requirementRefs.join("; ")}`
          : ""),
    )
    .join("\n");
}

function renderFiles(files: RepoFile[]): string {
  if (files.length === 0) return "(the repository appears to be empty)";
  return files
    .map((f) => `--- FILE: ${f.path} ---\n${f.content}`)
    .join("\n\n");
}

/**
 * Generate proposed code changes implementing a feature, grounded in its PRD,
 * tasks, and the current repository files. The result is a preview only — the
 * caller decides whether to commit it. `feedback` carries the user's notes on a
 * rejected proposal so a regenerate can incorporate them.
 */
export async function generateCodeChanges(input: {
  prd: GeneratedPrd;
  tasks: CodegenTask[];
  files: RepoFile[];
  feedback?: string;
}): Promise<GeneratedCodeChanges> {
  const prompt = [
    renderPrd(input.prd),
    `TASKS:\n${renderTasks(input.tasks)}`,
    `CURRENT REPOSITORY FILES:\n${renderFiles(input.files)}`,
    input.feedback
      ? `REVIEWER FEEDBACK ON THE PREVIOUS ATTEMPT (address it):\n${input.feedback}`
      : "",
    "Produce the file changes that implement the feature.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateStructured({
    schema: codeChangesSchema,
    model: models.codegen,
    system: CODEGEN_SYSTEM,
    prompt,
  });
}
