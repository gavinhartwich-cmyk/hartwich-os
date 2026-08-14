import { inngest } from "../client";
import { searchHvacCompanies, getPlaceReviewSnippets } from "@/lib/integrations/google-places";
import { findDuplicateCompany, createDiscoveredCompany } from "@/lib/data/companies";
import { enrichCompanyFromWebsite } from "@/lib/ai/enrich-company";
import { qualifyLead } from "@/lib/ai/qualify-lead";
import { getActiveLeadSourceConfig } from "@/lib/data/lead-sources";
import { notifySlack } from "@/lib/integrations/slack";

type DiscoverLeadsEventData = {
  area: string; // e.g. "Austin, TX"
  keyword?: string;
  requestedByUserId?: string;
};

/**
 * The Phase 2 "AI Lead Mining v1" workflow (architecture doc §5): discover
 * via Google Places → dedupe → enrich the website → qualify against the
 * ICP rubric → persist → notify. Triggered by the "Find Leads" form
 * (src/app/(app)/leads/find), which just sends the event below — everything
 * else runs here, off the request/response cycle, so it can take minutes
 * and retry per-company without a serverless function timing out.
 */
export const discoverLeads = inngest.createFunction(
  {
    id: "discover-leads",
    concurrency: { limit: 2 },
    triggers: [{ event: "leads/discover.requested" }],
  },
  async ({ event, step }) => {
    const data = event.data as DiscoverLeadsEventData;
    const area = data.area;

    const config = await step.run("load-lead-source-config", () =>
      getActiveLeadSourceConfig("google_places")
    );
    const configValues = (config?.config ?? {}) as {
      keyword?: string;
      franchiseBlocklist?: string[];
      autoFileThreshold?: number;
    };

    const keyword = data.keyword || configValues.keyword || "HVAC contractor";
    const franchiseBlocklist = configValues.franchiseBlocklist ?? [];

    const places = await step.run("search-places", () => searchHvacCompanies({ area, keyword }));

    let qualified = 0;
    let needsReview = 0;
    let disqualifiedCount = 0;
    let duplicates = 0;

    for (const place of places) {
      const outcome = await step.run(`process-${place.placeId}`, async () => {
        const dup = await findDuplicateCompany({ name: place.name, website: place.website });
        if (dup) return "duplicate" as const;

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

        await createDiscoveredCompany({ place, placeId: place.placeId, qualification });

        if (qualification.disqualifyReason) return "disqualified" as const;
        return qualification.autoFile ? ("qualified" as const) : ("needs_review" as const);
      });

      if (outcome === "duplicate") duplicates++;
      else if (outcome === "disqualified") disqualifiedCount++;
      else if (outcome === "qualified") qualified++;
      else needsReview++;
    }

    await step.run("notify-slack", () =>
      notifySlack(
        `Lead mining for "${keyword}" in ${area}: ${places.length} found — ` +
          `${qualified} qualified, ${needsReview} need review, ${disqualifiedCount} disqualified, ${duplicates} duplicates skipped.`
      )
    );

    return { found: places.length, qualified, needsReview, disqualified: disqualifiedCount, duplicates };
  }
);
