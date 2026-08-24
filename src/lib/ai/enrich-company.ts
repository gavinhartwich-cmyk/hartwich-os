import "server-only";
import { z } from "zod";
import { structuredCompletion, GROQ_STRUCTURED_MODEL } from "./groq-structured";
import { logAiRun } from "@/lib/data/ai-runs";

// Decision-maker fields are flat top-level strings rather than a nested
// `decisionMaker: {...}` object. Groq's strict JSON-schema mode requires
// *every* object in the schema — nested ones included — to declare its own
// full `required` list and `additionalProperties: false` (see the dialect
// note on ENRICHMENT_JSON_SCHEMA below); a nested object that's missing
// that gets silently dropped from the model's output instead of erroring,
// which is exactly what was happening here (100% of live enrichment runs
// came back with no decision-maker data at all, even when a name/email was
// clearly on the page). Flat nullable strings sidestep the whole nested-
// object failure mode.
const EnrichmentSchema = z.object({
  servicesOffered: z.array(z.string()),
  apparentSize: z.enum(["solo", "small", "medium", "large", "unknown"]),
  visibleContactNames: z.array(z.string()),
  contactName: z.string().nullable(),
  contactTitle: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactLinkedinUrl: z.string().nullable(),
  contactInstagramHandle: z.string().nullable(),
  summary: z.string(),
});

export type CompanyEnrichment = z.infer<typeof EnrichmentSchema> & {
  /**
   * A generic mailbox scraped straight off the page (mailto: links, or an
   * email-shaped string in the text) — deterministic, so it catches
   * addresses the LLM extraction misses. Used as the outreach fallback when
   * no named decision-maker email was found (see createDiscoveredCompany).
   */
  fallbackEmail: string | null;
};

// Hand-written to Groq's strict structured-output dialect (see
// groq-structured.ts) — keep in sync with EnrichmentSchema above.
const ENRICHMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    servicesOffered: { type: "array", items: { type: "string" } },
    apparentSize: { type: "string", enum: ["solo", "small", "medium", "large", "unknown"] },
    visibleContactNames: { type: "array", items: { type: "string" } },
    contactName: { type: ["string", "null"] },
    contactTitle: { type: ["string", "null"] },
    contactEmail: { type: ["string", "null"] },
    contactPhone: { type: ["string", "null"] },
    contactLinkedinUrl: { type: ["string", "null"] },
    contactInstagramHandle: { type: ["string", "null"] },
    summary: { type: "string" },
  },
  required: [
    "servicesOffered",
    "apparentSize",
    "visibleContactNames",
    "contactName",
    "contactTitle",
    "contactEmail",
    "contactPhone",
    "contactLinkedinUrl",
    "contactInstagramHandle",
    "summary",
  ],
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

// Third-party addresses that show up incidentally in page source (widget
// vendors, spec URLs, placeholder copy) — never a real contact for the
// business, so never worth surfacing as an outreach target.
const IGNORED_EMAIL_DOMAINS = new Set([
  "example.com",
  "sentry.io",
  "wixpress.com",
  "godaddy.com",
  "schema.org",
  "w3.org",
  "gravatar.com",
  "cloudflare.com",
  "google.com",
  "googleapis.com",
  "yourdomain.com",
  "yoursite.com",
  "domain.com",
]);

/**
 * Deterministic backstop for the LLM extraction above: pulls every
 * `mailto:` link and email-shaped string out of the raw HTML (footers,
 * contact-page markup the LLM's text-only view can miss) so a real mailbox
 * still surfaces even when no named decision-maker was found. Prefers an
 * address on the site's own domain over one picked up from an embedded
 * widget or third-party badge.
 */
function extractFallbackEmail(html: string, website: string): string | null {
  const found = new Set<string>();

  const mailtoRe = /mailto:([^"'?\s>]+)/gi;
  for (const m of html.matchAll(mailtoRe)) {
    try {
      found.add(decodeURIComponent(m[1]).toLowerCase());
    } catch {
      found.add(m[1].toLowerCase());
    }
  }

  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  for (const m of html.matchAll(emailRe)) found.add(m[0].toLowerCase());

  const candidates = [...found].filter((email) => {
    const domain = email.split("@")[1];
    if (!domain || IGNORED_EMAIL_DOMAINS.has(domain)) return false;
    if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(email)) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  let siteDomain: string | null = null;
  try {
    siteDomain = new URL(website).hostname.replace(/^www\./, "");
  } catch {
    siteDomain = null;
  }
  const onDomain = siteDomain ? candidates.find((e) => e.endsWith(`@${siteDomain}`)) : undefined;
  return onDomain ?? candidates[0];
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

  const fallbackEmail = extractFallbackEmail(html, website);
  const text = stripHtml(html).slice(0, MAX_SITE_TEXT_CHARS);
  if (!text) return fallbackEmail ? emptyEnrichment(fallbackEmail) : null;

  try {
    const result = await structuredCompletion({
      schemaName: "company_enrichment",
      jsonSchema: ENRICHMENT_JSON_SCHEMA,
      zodSchema: EnrichmentSchema,
      system:
        "You read small-business websites and extract a structured summary. " +
        "Extract the primary decision-maker (owner, CEO, manager) with as much detail as possible: name, title, email, phone, LinkedIn URL, Instagram handle. " +
        "Look in about pages, team pages, contact pages, LinkedIn links, social media links, email footers. " +
        'Only report what is actually stated or clearly implied on the page — do not guess or infer. ' +
        'Use "unknown" for apparentSize if you cannot tell. Use null for any contact field not found — a general "info@" or "office@" inbox counts as the contact email if no named person has one listed.',
      user: `Website (${website}) text content:\n\n${text}`,
    });

    await logAiRun({
      targetType: "enrichment",
      model: GROQ_STRUCTURED_MODEL,
      tokensUsed: result ? result.usage.inputTokens + result.usage.outputTokens : null,
      result: result?.parsed ?? null,
      status: result ? "succeeded" : "failed",
    });

    if (result?.parsed) return { ...result.parsed, fallbackEmail };
    return fallbackEmail ? emptyEnrichment(fallbackEmail) : null;
  } catch (err) {
    await logAiRun({
      targetType: "enrichment",
      model: GROQ_STRUCTURED_MODEL,
      status: "failed",
      result: { error: err instanceof Error ? err.message : String(err) },
    });
    return fallbackEmail ? emptyEnrichment(fallbackEmail) : null;
  }
}

/** Shell enrichment when the LLM pass fails/skips but a mailto scrape still found something. */
function emptyEnrichment(fallbackEmail: string | null): CompanyEnrichment {
  return {
    servicesOffered: [],
    apparentSize: "unknown",
    visibleContactNames: [],
    contactName: null,
    contactTitle: null,
    contactEmail: null,
    contactPhone: null,
    contactLinkedinUrl: null,
    contactInstagramHandle: null,
    summary: "",
    fallbackEmail,
  };
}
