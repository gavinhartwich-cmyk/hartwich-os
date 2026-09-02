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

// Groq's free/on-demand tier caps at 8000 tokens-per-minute — easy to blow
// through when discovery runs several enrichment + qualification calls back
// to back (each request in this app runs ~2-2.5k tokens). A 429 there means
// "wait, don't give up" — Groq's error body includes a suggested wait, which
// this reads and honors instead of failing the whole enrichment/qualification
// step outright (that used to silently drop ~60% of enrichment runs).
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

function isRateLimitError(err: unknown): err is { status: number; message?: string } {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 429;
}

function retryDelayMs(err: { message?: string }): number {
  const match = err.message?.match(/try again in ([\d.]+)s/i);
  const seconds = match ? Number(match[1]) : null;
  return seconds && Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 250 : DEFAULT_RETRY_DELAY_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  /** Defaults to 1024 — override for call sites whose expected output (e.g. a full email body) runs longer than a compact JSON result. */
  maxCompletionTokens?: number;
}): Promise<StructuredCompletionResult<T> | null> {
  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await groq.chat.completions.create({
        model: opts.model ?? GROQ_STRUCTURED_MODEL,
        max_completion_tokens: opts.maxCompletionTokens ?? 1024,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, strict: true, schema: opts.jsonSchema },
        },
      });
      break;
    } catch (err) {
      if (isRateLimitError(err) && attempt < MAX_RATE_LIMIT_RETRIES) {
        await sleep(retryDelayMs(err));
        continue;
      }
      throw err;
    }
  }

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
