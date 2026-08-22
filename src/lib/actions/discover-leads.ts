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
  const { area, keyword: userKeyword, requestedByUserId } = params;

  // Spawn background processing without waiting
  (async () => {
    try {
      const config = await getActiveLeadSourceConfig("google_places");
      const configValues = (config?.config ?? {}) as {
        keyword?: string;
        franchiseBlocklist?: string[];
        autoFileThreshold?: number;
      };

      const keyword = userKeyword || configValues.keyword || "HVAC contractor";
      const franchiseBlocklist = configValues.franchiseBlocklist ?? [];

      const places = await searchHvacCompanies({ area, keyword });

      let qualified = 0;
      let needsReview = 0;
      let disqualifiedCount = 0;
      let duplicates = 0;

      for (const place of places) {
        try {
          const dup = await findDuplicateCompany({
            name: place.name,
            website: place.website,
          });
          if (dup) {
            duplicates++;
            continue;
          }

          const [enrichment, reviewSnippets] = await Promise.all([
            enrichCompanyFromWebsite(place.website),
            getPlaceReviewSnippets(place.placeId),
          ]);

          const qualification = await qualifyLead({
            place,
            enrichment,
            reviewSnippets,
            franchiseBlocklist,
            autoFileThreshold: configValues.autoFileThreshold,
          });

          await createDiscoveredCompany({
            place,
            placeId: place.placeId,
            qualification,
          });

          if (qualification.disqualifyReason) {
            disqualifiedCount++;
          } else if (qualification.autoFile) {
            qualified++;
          } else {
            needsReview++;
          }
        } catch (error) {
          console.error(`Failed to process ${place.name}:`, error);
        }
      }

      await notifySlack(
        `Lead mining for "${keyword}" in ${area}: ${places.length} found — ` +
          `${qualified} qualified, ${needsReview} need review, ${disqualifiedCount} disqualified, ${duplicates} duplicates skipped.`
      );
    } catch (error) {
      console.error("Lead discovery failed:", error);
      await notifySlack(`❌ Lead mining failed for ${area}: ${error}`).catch(() => {});
    }
  })();

  // Return immediately so user sees results page
  return { started: true };
}
