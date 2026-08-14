/**
 * Isolated Groq API/schema smoke test for the Phase 2 AI migration.
 *
 * Exercises the two real call sites (enrichCompanyFromWebsite,
 * qualifyLead) directly against the live Groq API and the dev database
 * (ai_runs logging), without going through Google Places, Inngest, or
 * Slack — the point is to confirm the strict-schema structured-output
 * integration actually works before spending a full "Find Leads" run on
 * it. Run with:
 *
 *   npx tsx scripts/test-groq-integration.ts
 */
import "dotenv/config";
import { enrichCompanyFromWebsite } from "../src/lib/ai/enrich-company";
import { qualifyLead } from "../src/lib/ai/qualify-lead";
import type { PlaceResult } from "../src/lib/integrations/google-places";

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error(
      "GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys " +
        "(no credit card required) and add it to .env.local, then re-run this script."
    );
    process.exit(1);
  }

  console.log("--- 1. enrichCompanyFromWebsite ---");
  const enrichment = await enrichCompanyFromWebsite("https://example.com");
  console.log(JSON.stringify(enrichment, null, 2));
  if (!enrichment) {
    console.error("FAIL: enrichment returned null — check the ai_runs 'failed' row for details.");
    process.exitCode = 1;
  } else {
    console.log("OK: enrichment matched the strict schema.");
  }

  console.log("\n--- 2. qualifyLead ---");
  const place: PlaceResult = {
    placeId: "test-place-id",
    name: "Ace Comfort Heating & Air",
    address: "123 Main St, Austin, TX",
    phone: "+15125550100",
    website: "https://example.com",
    rating: 4.2,
    userRatingCount: 37,
  };
  const qualification = await qualifyLead({
    place,
    enrichment,
    reviewSnippets: [
      { rating: 5, text: "Great same-day service, fair price.", relativeTime: "2 weeks ago" },
      { rating: 2, text: "Took a while to call back.", relativeTime: "3 months ago" },
    ],
    franchiseBlocklist: [],
  });
  console.log(JSON.stringify(qualification, null, 2));
  if (qualification.reasoning.startsWith("AI qualification")) {
    console.error("FAIL: qualification fell back to the manual-review error path.");
    process.exitCode = 1;
  } else {
    console.log("OK: qualification matched the strict schema.");
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error("Script threw:", err);
  process.exit(1);
});
