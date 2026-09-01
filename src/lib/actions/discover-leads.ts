import { after } from "next/server";
import {
  searchHvacCompanies,
  searchHvacCompaniesInRadius,
  geocodeArea,
} from "@/lib/integrations/google-places";
import { findDuplicateCompany, createDiscoveredCompany } from "@/lib/data/companies";
import { enrichCompanyFromWebsite } from "@/lib/ai/enrich-company";
import { qualifyLead } from "@/lib/ai/qualify-lead";
import {
  createDiscoveryRun,
  updateDiscoveryRunProgress,
  completeDiscoveryRun,
} from "@/lib/data/discovery-runs";
import { notifySlack } from "@/lib/integrations/slack";

type DiscoverLeadsParams = {
  area: string;
  keyword?: string;
  targetCount?: number;
  requestedByUserId?: string;
};

// Radius rings (miles) to try, in order, before giving up short of the
// target — capped here rather than growing unbounded so "expand the area"
// can't quietly turn into "search the whole continent" (the rubric's
// "local HVAC service business" must-have still has to mean something).
const RADIUS_STEPS_MILES = [15, 30, 50, 75, 100];
const MAX_PAGES_PER_RADIUS = 3; // Places caps at ~60 results (3 x 20) per query anyway
const DEFAULT_TARGET_COUNT = 20;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Direct lead discovery without Inngest (no paid service dependency).
 * Searches Google Places → enriches → qualifies → persists to database.
 * Runs synchronously but quickly returns to user while processing continues.
 *
 * Takes a target number of *qualified* leads. If the initial area doesn't
 * have enough, the search radius grows in steps (see RADIUS_STEPS_MILES)
 * until the target is hit or the radius cap is reached — the quality bar
 * in qualifyLead never loosens to make up the difference.
 */
export async function discoverLeads(params: DiscoverLeadsParams) {
  const { area, keyword: userKeyword, targetCount, requestedByUserId } = params;
  const keyword = userKeyword || "HVAC contractor";
  const target = targetCount && targetCount > 0 ? targetCount : DEFAULT_TARGET_COUNT;

  const run = await createDiscoveryRun({ area, keyword, targetCount: target, requestedByUserId });

  // Start background job but don't wait for it. `after()` (not setImmediate)
  // because serverless platforms like Vercel can freeze the process the
  // instant the response is sent — setImmediate's callback would never run
  // there. `after()` uses the platform's own hook to keep it alive.
  after(async () => {
    const seenPlaceIds = new Set<string>();
    let created = 0;
    let skipped = 0;
    let finalRadius: number | undefined;

    try {
      console.log(`[LD] Starting run ${run.id} for "${area}" (target: ${target} qualified)`);

      // First pass: the plain keyword-in-area query (fast path — usually
      // enough on its own for a normal-sized city).
      const initialPlaces = await searchHvacCompanies({ area, keyword });
      for (const p of initialPlaces) seenPlaceIds.add(p.placeId);
      created += await processPlaces(initialPlaces);

      if (created < target) {
        const center = await geocodeArea(area);
        if (!center) {
          console.log(`[LD] Couldn't resolve a center point for "${area}" — can't expand radius.`);
        } else {
          for (const radiusMiles of RADIUS_STEPS_MILES) {
            if (created >= target) break;
            finalRadius = radiusMiles;
            await updateDiscoveryRunProgress(run.id, { foundCount: created, radiusMiles });
            console.log(`[LD] Expanding to ${radiusMiles}mi around "${area}" (have ${created}/${target})`);

            let pageToken: string | undefined;
            for (let page = 0; page < MAX_PAGES_PER_RADIUS; page++) {
              if (created >= target) break;

              const { places, nextPageToken } = await searchHvacCompaniesInRadius({
                center,
                radiusMiles,
                keyword,
                pageToken,
              });

              const newPlaces = places.filter((p) => !seenPlaceIds.has(p.placeId));
              for (const p of newPlaces) seenPlaceIds.add(p.placeId);

              created += await processPlaces(newPlaces);
              await updateDiscoveryRunProgress(run.id, { foundCount: created, radiusMiles });

              if (!nextPageToken || newPlaces.length === 0) break;
              pageToken = nextPageToken;
              // A fresh page token needs a moment to become valid.
              await sleep(2000);
            }
          }
        }
      }

      const finalStatus = created >= target ? "completed" : "completed_partial";
      await completeDiscoveryRun(run.id, finalStatus, { foundCount: created, radiusMiles: finalRadius });

      console.log(`[LD] Complete (${finalStatus}): ${created}/${target} created, ${skipped} skipped`);
      await notifySlack(
        `Lead mining for "${keyword}" in ${area}: ${created}/${target} qualified` +
          (finalRadius ? ` (expanded to ${finalRadius}mi)` : "")
      ).catch(() => {});
    } catch (err) {
      console.error(`[LD] Fatal error:`, err);
      await completeDiscoveryRun(run.id, "failed", { foundCount: created, radiusMiles: finalRadius }).catch(
        () => {}
      );
    }

    /**
     * Dedup, qualify (cheap, no external call), and — only for candidates
     * that actually pass — enrich and persist. Checking qualification
     * before enrichment means a wider radius doesn't multiply AI/website-
     * fetch costs against candidates that were always going to be skipped.
     */
    async function processPlaces(places: Awaited<ReturnType<typeof searchHvacCompanies>>) {
      let createdHere = 0;
      for (const place of places) {
        try {
          const qualification = await qualifyLead({
            place,
            enrichment: null,
            reviewSnippets: [],
            franchiseBlocklist: [],
          });

          if (qualification.disqualifyReason) {
            skipped++;
            continue;
          }

          const existing = await findDuplicateCompany({ name: place.name, website: place.website });
          if (existing) {
            skipped++;
            continue;
          }

          const enrichment = await enrichCompanyFromWebsite(place.website);

          await createDiscoveredCompany({
            place,
            placeId: place.placeId,
            qualification,
            enrichment,
          });

          createdHere++;
          console.log(
            `[LD] Qualified: ${place.name} (${place.userRatingCount || 0} reviews, ${place.rating || 5}★)`
          );
        } catch (err) {
          console.error(`[LD] Error: ${place.name}:`, err);
          skipped++;
        }
      }
      return createdHere;
    }
  });

  return { started: true, runId: run.id };
}
