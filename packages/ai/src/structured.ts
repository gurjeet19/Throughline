import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";

export async function generateStructured<T>(options: {
  schema: z.ZodType<T>;
  prompt: string;
  model: string;
  system?: string;
}): Promise<T> {
  const { schema, prompt, model, system } = options;
  const { object } = await generateObject({
    model: openai(model),
    schema,
    prompt,
    system,
  });
  return object;
}
