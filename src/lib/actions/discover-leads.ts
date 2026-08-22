import { searchHvacCompanies, getPlaceReviewSnippets } from "@/lib/integrations/google-places";
import { findDuplicateCompany, createDiscoveredCompany } from "@/lib/data/companies";
import { enrichCompanyFromWebsite } from "@/lib/ai/enrich-company";
import { qualifyLead } from "@/lib/ai/qualify-lead";
import { getActiveLeadSourceConfig } from "@/lib/data/lead-sources";
import { notifySlack } from "@/lib/integrations/slack";

type DiscoverLeadsParams = {
  area: string;
  keyword?: string;
  requestedByUserId?: string;
};

/**
 * Direct lead discovery without Inngest (no paid service dependency).
 * Searches Google Places → enriches → qualifies → persists to database.
 * Runs synchronously but quickly returns to user while processing continues.
 */
export async function discoverLeads(params: DiscoverLeadsParams) {
  const { area, keyword: userKeyword } = params;

  // Start background job but don't wait for it
  setImmediate(async () => {
    try {
      const keyword = userKeyword || "HVAC contractor";
      const franchiseBlocklist: string[] = [];

      console.log(`[LD] Starting for "${area}" with keyword "${keyword}"`);
      const places = await searchHvacCompanies({ area, keyword });
      console.log(`[LD] Found ${places.length} companies`);

      if (places.length === 0) {
        console.log(`[LD] No results for ${area}`);
        return;
      }

      let created = 0;
      let skipped = 0;

      for (const place of places) {
        try {
          // Check if duplicate FIRST (before wasting time on enrichment)
          const existing = await findDuplicateCompany({
            name: place.name,
            website: place.website,
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Qualify based on Google reviews only (no Groq needed)
          const qualification = await qualifyLead({
            place,
            enrichment: null, // Don't need enrichment for simple review-based qualification
            reviewSnippets: [],
            franchiseBlocklist,
          });

          // Only save if qualified
          if (qualification.disqualifyReason) {
            skipped++;
            continue;
          }

          // Save to database
          await createDiscoveredCompany({
            place,
            placeId: place.placeId,
            qualification,
          });

          created++;
          console.log(
            `[LD] Qualified: ${place.name} (${place.userRatingCount || 0} reviews, ${place.rating || 5}★)`
          );
        } catch (err) {
          console.error(`[LD] Error: ${place.name}:`, err);
          skipped++;
        }
      }

      console.log(`[LD] Complete: ${created} created, ${skipped} skipped`);
      await notifySlack(
        `Lead mining for "${keyword}" in ${area}: ${created} saved (${skipped} duplicates/errors)`
      ).catch(() => {});
    } catch (err) {
      console.error(`[LD] Fatal error:`, err);
    }
  });

  return { started: true };
}
