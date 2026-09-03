import "server-only";
import { z } from "zod";
import { structuredCompletion, GROQ_STRUCTURED_MODEL } from "./groq-structured";
import { logAiRun } from "@/lib/data/ai-runs";
import { searchWeb, isTavilyConfigured } from "@/lib/integrations/tavily";
import type { CompanyEnrichment } from "./enrich-company";

const DecisionMakerSchema = z.object({
  name: z.string().nullable(),
  title: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
});

const DECISION_MAKER_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    linkedinUrl: { type: ["string", "null"] },
  },
  required: ["name", "title", "linkedinUrl"],
  additionalProperties: false,
};

export type DecisionMaker = { name: string; title: string | null; linkedinUrl: string | null };

/**
 * Free fallback for finding the owner/decision-maker when the company's own
 * website doesn't name one (see enrichCompanyFromWebsite): a Tavily web
 * search scoped to bbb.org + linkedin.com — the two sources most likely to
 * name a small business's owner in a public search snippet (a BBB profile's
 * "Business Management" line, a LinkedIn "Owner at ..." title) — read by
 * Groq the same way enrich-company.ts reads a scraped page.
 *
 * One search per call (Tavily's free tier is 1,000 credits/month, one
 * credit per basic search — plenty for "only when the website didn't have
 * a name," not for searching every company regardless). Returns null if
 * Tavily isn't configured, the search comes back empty, or nothing in the
 * results clearly names an owner — callers treat that as a normal, not
 * surprising, outcome.
 */
export async function findDecisionMakerViaSearch(input: {
  companyName: string;
  location: string | null; // e.g. "Austin, TX" — the search area or company city/state
}): Promise<DecisionMaker | null> {
  if (!isTavilyConfigured()) return null;

  const query = `${input.companyName}${input.location ? ` ${input.location}` : ""} owner OR founder OR president`;
  const results = await searchWeb({
    query,
    includeDomains: ["bbb.org", "linkedin.com"],
    maxResults: 5,
  });
  if (!results || results.length === 0) return null;

  const snippetText = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
    .join("\n\n")
    .slice(0, 6000);

  try {
    const result = await structuredCompletion({
      schemaName: "decision_maker_search",
      jsonSchema: DECISION_MAKER_JSON_SCHEMA,
      zodSchema: DecisionMakerSchema,
      system:
        "You read BBB and LinkedIn search-result snippets for a small business and identify its owner or " +
        "primary decision-maker (owner, CEO, president, founder). Only report a name if a snippet clearly " +
        "names that specific person as this business's owner/decision-maker — a same-named person at a " +
        "different company, or a name mentioned for an unrelated reason, doesn't count. If a snippet's URL " +
        "is a linkedin.com/in/... profile for that person, use it as linkedinUrl. Use null for anything not " +
        "clearly supported by the snippets — do not guess.",
      user: `Business: ${input.companyName}${input.location ? ` (${input.location})` : ""}\n\nSearch results:\n\n${snippetText}`,
    });

    await logAiRun({
      targetType: "enrichment",
      model: GROQ_STRUCTURED_MODEL,
      tokensUsed: result ? result.usage.inputTokens + result.usage.outputTokens : null,
      result: result?.parsed ?? null,
      status: result ? "succeeded" : "failed",
    });

    if (!result?.parsed?.name) return null;
    return { name: result.parsed.name, title: result.parsed.title, linkedinUrl: result.parsed.linkedinUrl };
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

/**
 * Folds a decision-maker search hit into a website enrichment result (or
 * starts a fresh one, when the site scrape found nothing at all) so
 * createDiscoveredCompany's existing "make a contact from the enrichment"
 * logic picks it up without needing to know where the name came from.
 */
export function overlayDecisionMaker(base: CompanyEnrichment | null, dm: DecisionMaker): CompanyEnrichment {
  return {
    servicesOffered: base?.servicesOffered ?? [],
    apparentSize: base?.apparentSize ?? "unknown",
    visibleContactNames: base?.visibleContactNames ?? [],
    contactName: dm.name,
    contactTitle: dm.title ?? base?.contactTitle ?? null,
    contactEmail: base?.contactEmail ?? null,
    contactPhone: base?.contactPhone ?? null,
    contactLinkedinUrl: dm.linkedinUrl ?? base?.contactLinkedinUrl ?? null,
    contactInstagramHandle: base?.contactInstagramHandle ?? null,
    summary: base?.summary ?? "",
    fallbackEmail: base?.fallbackEmail ?? null,
  };
}
