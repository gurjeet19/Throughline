import { generateText as sdkGenerateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function generateText(options: {
  prompt: string;
  model: string;
  system?: string;
}): Promise<string> {
  const { prompt, model, system } = options;
  const { text } = await sdkGenerateText({
    model: openai(model),
    prompt,
    system,
  });
  return text;
}
