import "server-only";
import type { PlaceResult, ReviewSnippet } from "@/lib/integrations/google-places";
import type { CompanyEnrichment } from "./enrich-company";

export type QualificationResult = {
  autoFile: boolean;
  score: number;
  reasoning: string;
  contactTier: "A" | "B" | "C" | null;
  isOwnerOperated: boolean | null;
  isFranchise: boolean;
  disqualifyReason: string | null;
};

/**
 * Scores a discovered lead by a simple, deterministic review-count/rating
 * rule (commit 1fc1c54, "Simplify lead qualification") — qualify if 0-60
 * Google reviews OR under 4 stars. This intentionally replaced an earlier
 * AI-scored version of this function (Groq call against a full ICP rubric,
 * franchise-brand blocklist cross-check, A/B/C contact-tier assignment).
 *
 * That means, as of this simplification: `franchiseBlocklist` is accepted
 * but not consulted (franchise chains are no longer filtered out),
 * `contactTier` and `isOwnerOperated` are always null, and `isFranchise` is
 * always false. If franchise filtering needs to come back, it needs to be
 * deliberately re-added here, not just restoring the old AI call.
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
