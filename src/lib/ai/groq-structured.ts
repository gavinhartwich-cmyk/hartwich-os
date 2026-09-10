import "server-only";
import type Groq from "groq-sdk";
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

/**
 * Thrown (rather than folded into the generic `null` return) so a caller can
 * distinguish "the shared daily AI budget is spent" — a real, explainable
 * state that lasts hours — from an ordinary transient failure.
 */
export class GroqDailyLimitError extends Error {
  readonly name = "GroqDailyLimitError";

  /** Minutes until Groq says the budget frees up, when its error states one. */
  readonly retryAfterMinutes: number | null;

  constructor(message: string) {
    super(message);
    const match = message.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
    if (!match || (!match[1] && !match[2] && !match[3])) {
      this.retryAfterMinutes = null;
    } else {
      const totalSeconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
      this.retryAfterMinutes = totalSeconds > 0 ? Math.ceil(totalSeconds / 60) : null;
    }
  }
}

/**
 * True for a 429 against the *daily* token allowance (TPD) rather than the
 * per-minute one (TPM). Groq words it as e.g. "Rate limit reached ... on
 * tokens per day (TPD): Limit 200000, Used 198528".
 *
 * The two want opposite handling: a TPM 429 clears in seconds and should be
 * waited out, while a TPD 429 means the day's budget is gone — retrying only
 * makes the caller wait longer to fail, and callers want to say so plainly
 * rather than show a generic "try again in a moment".
 */
export function isDailyTokenLimitError(err: unknown): boolean {
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : "";
  return /tokens per day|\bTPD\b/i.test(message);
}

/**
 * Groq's suggested wait, in ms. The duration is a Go-style string, so it can
 * carry hour/minute parts ("7m59.52s", "1h2m3s") — parsing only a bare
 * `([\d.]+)s` silently missed those and fell back to the 5s default, so a
 * 7-minute wait got retried 3 times over ~15 seconds and failed anyway
 * (Gavin, 2026-09-10).
 */
function retryDelayMs(err: { message?: string }): number {
  const match = err.message?.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (!match || (!match[1] && !match[2] && !match[3])) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) + 250 : DEFAULT_RETRY_DELAY_MS;
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
 * mismatch) — callers treat that the same as an API error. The one exception
 * is a daily-token-limit 429, which throws GroqDailyLimitError so callers can
 * explain that specific (hours-long) state rather than showing a generic
 * transient-failure message.
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
  /** Defaults to the shared agent key. Pass `groqInteractive` for human-facing calls that shouldn't be starved by batch agent work. */
  client?: Groq;
}): Promise<StructuredCompletionResult<T> | null> {
  const client = opts.client ?? groq;
  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await client.chat.completions.create({
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
      // The day's budget is gone — retrying can't help, and callers want to
      // tell the user that specifically rather than "try again in a moment".
      if (isRateLimitError(err) && isDailyTokenLimitError(err)) {
        throw new GroqDailyLimitError(err.message ?? "Groq daily token limit reached.");
      }
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
