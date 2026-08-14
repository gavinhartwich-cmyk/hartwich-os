import "server-only";
import type { z } from "zod";
import { groq } from "./groq";

/**
 * Groq's `response_format: json_schema` strict mode (console.groq.com/docs/structured-outputs)
 * is currently only available on the GPT-OSS models. 120b over 20b for the
 * extra reasoning quality on the qualification rubric — Phase 2's call
 * volume is nowhere near either model's free-tier rate limit.
 */
export const GROQ_STRUCTURED_MODEL = "openai/gpt-oss-120b";

export type StructuredCompletionResult<T> = {
  parsed: T;
  usage: { inputTokens: number; outputTokens: number };
};

/**
 * Runs a Groq chat completion constrained to a strict JSON Schema, then
 * validates the parsed JSON against the corresponding Zod schema.
 *
 * Strict mode has its own dialect (console.groq.com/docs/structured-outputs):
 * every property must appear in `required`, every object needs
 * `additionalProperties: false`, and optional/nullable fields are expressed
 * as a `type: [T, "null"]` union rather than Zod's `.nullable()` `oneOf`
 * form — so `jsonSchema` is hand-written per call site to that dialect
 * rather than derived from `zodSchema`. `zodSchema` stays the source of
 * truth for validating what actually comes back (and for the TS type).
 *
 * Returns null on any failure (bad response, non-JSON content, schema
 * mismatch) — callers treat that the same as an API error.
 */
export async function structuredCompletion<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  zodSchema: z.ZodType<T>;
  model?: string;
}): Promise<StructuredCompletionResult<T> | null> {
  const response = await groq.chat.completions.create({
    model: opts.model ?? GROQ_STRUCTURED_MODEL,
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.schemaName, strict: true, schema: opts.jsonSchema },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }

  const result = opts.zodSchema.safeParse(raw);
  if (!result.success) return null;

  return {
    parsed: result.data,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
  };
}
