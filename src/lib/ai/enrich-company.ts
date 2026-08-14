import "server-only";
import { z } from "zod";
import { structuredCompletion, GROQ_STRUCTURED_MODEL } from "./groq-structured";
import { logAiRun } from "@/lib/data/ai-runs";

const EnrichmentSchema = z.object({
  servicesOffered: z.array(z.string()),
  apparentSize: z.enum(["solo", "small", "medium", "large", "unknown"]),
  visibleContactNames: z.array(z.string()),
  summary: z.string(),
});

export type CompanyEnrichment = z.infer<typeof EnrichmentSchema>;

// Hand-written to Groq's strict structured-output dialect (see
// groq-structured.ts) — keep in sync with EnrichmentSchema above.
const ENRICHMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    servicesOffered: { type: "array", items: { type: "string" } },
    apparentSize: { type: "string", enum: ["solo", "small", "medium", "large", "unknown"] },
    visibleContactNames: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["servicesOffered", "apparentSize", "visibleContactNames", "summary"],
  additionalProperties: false,
};

const MAX_SITE_TEXT_CHARS = 15_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetches a company's website server-side and asks Groq for a structured
 * summary — services offered, apparent size, visible contact names
 * (architecture doc §5, "Enrich" step). Returns null if there's no website
 * or the fetch/parse fails; qualification still runs on the Places signals
 * alone in that case.
 */
export async function enrichCompanyFromWebsite(website: string | null): Promise<CompanyEnrichment | null> {
  if (!website) return null;

  let html: string;
  try {
    const res = await fetch(website, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const text = stripHtml(html).slice(0, MAX_SITE_TEXT_CHARS);
  if (!text) return null;

  try {
    const result = await structuredCompletion({
      schemaName: "company_enrichment",
      jsonSchema: ENRICHMENT_JSON_SCHEMA,
      zodSchema: EnrichmentSchema,
      system:
        "You read small-business websites and extract a structured summary. " +
        'Only report what is actually stated or clearly implied on the page — do not guess. ' +
        'Use "unknown" for apparentSize if you cannot tell.',
      user: `Website (${website}) text content:\n\n${text}`,
    });

    await logAiRun({
      targetType: "enrichment",
      model: GROQ_STRUCTURED_MODEL,
      tokensUsed: result ? result.usage.inputTokens + result.usage.outputTokens : null,
      result: result?.parsed ?? null,
      status: result ? "succeeded" : "failed",
    });

    return result?.parsed ?? null;
  } catch (err) {
    await logAiRun({
      targetType: "enrichment",
      model: GROQ_STRUCTURED_MODEL,
      status: "failed",
      result: { error: err instanceof Error ? err.message : String(err) },
    });
    return null;
  }
}
