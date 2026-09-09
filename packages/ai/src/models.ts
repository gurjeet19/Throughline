export const models = {
  triage: process.env.AI_MODEL_TRIAGE ?? "gpt-4o",
  prd: process.env.AI_MODEL_PRD ?? "gpt-4o",
  tasks: process.env.AI_MODEL_TASKS ?? "gpt-4o",
  codegen: process.env.AI_MODEL_CODEGEN ?? "gpt-4o",
  review: process.env.AI_MODEL_REVIEW ?? "gpt-4o",
  releaseReadiness: process.env.AI_MODEL_RELEASE_READINESS ?? "gpt-4o",
} as const;
