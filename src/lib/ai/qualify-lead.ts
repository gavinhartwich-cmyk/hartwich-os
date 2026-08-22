import "server-only";
import { z } from "zod";
import { structuredCompletion, GROQ_STRUCTURED_MODEL } from "./groq-structured";
import { logAiRun } from "@/lib/data/ai-runs";
import { HVAC_FRANCHISE_BRANDS } from "./hvac-franchise-brands";
import type { PlaceResult, ReviewSnippet } from "@/lib/integrations/google-places";
import type { CompanyEnrichment } from "./enrich-company";

// "High-confidence" cutoff for auto-filing onto the board (architecture doc
// §5 says "high-confidence scores auto-file... low-confidence land in a
// review queue" but doesn't pin a number — this default is configurable via
// lead_sources_config.config.autoFileThreshold, not part of the rubric).
const DEFAULT_AUTO_FILE_THRESHOLD = 70;

const QualificationSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string(),
  contactTier: z.enum(["A", "B", "C"]).nullable(),
  isOwnerOperated: z.boolean().nullable(),
  isFranchise: z.boolean(),
  franchiseReasoning: z.string().nullable(),
});

export type QualificationResult = {
  autoFile: boolean;
  score: number;
  reasoning: string;
  contactTier: "A" | "B" | "C" | null;
  isOwnerOperated: boolean | null;
  isFranchise: boolean;
  disqualifyReason: string | null;
};

// Reproduces the §5 rubric verbatim — do not paraphrase or loosen any of
// these rules; the code below evaluates the two objective/numeric gates
// directly rather than trusting the model's arithmetic.
const RUBRIC_SYSTEM_PROMPT = `
You score HVAC company leads for Hartwich Labs against this exact ideal-customer-profile rubric. Do not invent or loosen any of these rules.

Must have (all required): local HVAC service business; residential or mixed residential/commercial; small–medium sized; has a website; reachable through some contact channel.

Auto-disqualify (any one is disqualifying): 100+ Google reviews AND 4.5+ rating; large franchise/multi-location chain; no online presence; no working contact path found.

Signals that raise the score: under 100 Google reviews; below 4.5 star rating; recent negative or unanswered reviews; owner/operator structure.

Contact tier: A = owner name + email + social profile(s) found. B = business email + phone found, no named owner. C = website contact form only.

"Large franchise" is detected by cross-checking against a maintained list of known HVAC franchise brands, backed up by your own read of the site (e.g. corporate boilerplate, multi-location listings).

Score the lead 0-100 and give a short written reason referencing the specific signals above. Set isFranchise true only if you are confident it is a multi-location chain, not a single-location independent business that happens to share a common name.
`.trim();

// Hand-written to Groq's strict structured-output dialect (see
// groq-structured.ts) — keep in sync with QualificationSchema above.
// Nullable fields are expressed as a `[type, "null"]` union (Groq's
// documented convention), not Zod's `.nullable()` `oneOf` form, and every
// property — nullable or not — still appears in `required`.
const QUALIFICATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    reasoning: { type: "string" },
    contactTier: { type: ["string", "null"], enum: ["A", "B", "C", null] },
    isOwnerOperated: { type: ["boolean", "null"] },
    isFranchise: { type: "boolean" },
    franchiseReasoning: { type: ["string", "null"] },
  },
  required: [
    "score",
    "reasoning",
    "contactTier",
    "isOwnerOperated",
    "isFranchise",
    "franchiseReasoning",
  ],
  additionalProperties: false,
};

/**
 * Scores a discovered lead against the exact §5 ICP rubric. The objective
 * auto-disqualify gates (review-count+rating threshold, and "no online
 * presence"/"no working contact path", approximated here as "no website
 * and no phone" given Places is the only signal we have for either) are
 * evaluated in code rather than left to the model; franchise detection,
 * the qualitative score, and contact tier still go through Groq.
 */
export async function qualifyLead(input: {
  place: PlaceResult;
  enrichment: CompanyEnrichment | null;
  reviewSnippets: ReviewSnippet[];
  franchiseBlocklist: string[];
  autoFileThreshold?: number;
}): Promise<QualificationResult> {
  const { place } = input;

  // Simple rule: qualify if 0-60 reviews OR below 4 stars
  const reviewCount = place.userRatingCount ?? 0;
  const rating = place.rating ?? 5;

  const isQualified = reviewCount <= 60 || rating < 4;

  if (!isQualified) {
    return disqualified(
      `Too many reviews (${reviewCount}) with high rating (${rating}★) — they don't need help.`,
      false
    );
  }

  return {
    autoFile: true, // All qualified leads auto-file
    score: 100,
    reasoning:
      reviewCount === 0
        ? "No Google reviews — perfect opportunity to establish review pipeline."
        : reviewCount <= 60
          ? `Only ${reviewCount} reviews — good opportunity to reach out.`
          : `${rating}★ rating — below 4 stars means they need help with service quality.`,
    contactTier: null,
    isOwnerOperated: null,
    isFranchise: false,
    disqualifyReason: null,
  };
}

function disqualified(reason: string, isFranchise: boolean): QualificationResult {
  return {
    autoFile: false,
    score: 0,
    reasoning: `Auto-disqualified: ${reason}`,
    contactTier: null,
    isOwnerOperated: null,
    isFranchise,
    disqualifyReason: reason,
  };
}

function buildContext(
  place: PlaceResult,
  enrichment: CompanyEnrichment | null,
  reviews: ReviewSnippet[]
): string {
  const lines = [
    `Company: ${place.name}`,
    `Address: ${place.address ?? "unknown"}`,
    `Phone: ${place.phone ?? "none found"}`,
    `Website: ${place.website ?? "none found"}`,
    `Google rating: ${place.rating ?? "unknown"}`,
    `Google review count: ${place.userRatingCount ?? "unknown"}`,
  ];

  if (reviews.length > 0) {
    lines.push("Recent review snippets:");
    for (const r of reviews) {
      lines.push(`  - (${r.rating}★, ${r.relativeTime}) ${r.text}`);
    }
  } else {
    lines.push("Recent review snippets: none available");
  }

  if (enrichment) {
    lines.push(`Website summary: ${enrichment.summary}`);
    lines.push(`Services offered: ${enrichment.servicesOffered.join(", ") || "unclear"}`);
    lines.push(`Apparent size: ${enrichment.apparentSize}`);
    lines.push(`Visible contact names: ${enrichment.visibleContactNames.join(", ") || "none found"}`);
  } else {
    lines.push("No website content could be read.");
  }

  return lines.join("\n");
}
