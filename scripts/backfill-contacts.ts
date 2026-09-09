/**
 * Backfill for companies with no contact on file. Originally written for
 * companies discovered before the Groq structured-output bug fix (see the
 * "Fix Groq 429s..." commit), it now also covers a second, longer-standing
 * gap: discoverLeads (src/inngest/functions/discover-leads.ts) computed
 * website enrichment but never actually passed it to createDiscoveredCompany
 * — every automated discovery run before that fix persisted a company with
 * no contact and no website summary, even when the scrape found one.
 *
 * For each non-disqualified company with no contact yet: re-run the website
 * scrape if it has a website, then fall back to a BBB/LinkedIn web search
 * (findDecisionMakerViaSearch — free on Tavily's tier, no-ops without
 * TAVILY_API_KEY) if that didn't name anyone. Companies with no website
 * skip straight to the search step instead of being skipped entirely.
 *
 * "server-only" throws when required outside Next's build (it only
 * resolves to the real no-op via the "react-server" export condition,
 * which plain Node doesn't apply) — run with:
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/backfill-contacts.ts [--dry-run]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { companies, contacts } from "../src/db/schema";
import { enrichCompanyFromWebsite } from "../src/lib/ai/enrich-company";
import { findDecisionMakerViaSearch, overlayDecisionMaker } from "../src/lib/ai/find-decision-maker";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const candidates = await db.query.companies.findMany({
    where: (company, { ne }) => ne(company.status, "disqualified"),
    with: { contacts: true },
  });

  const needsBackfill = candidates.filter((c) => c.contacts.length === 0);
  console.log(`${candidates.length} active companies, ${needsBackfill.length} missing a contact.\n`);

  let enriched = 0;
  let contactsCreated = 0;
  let viaSearch = 0;
  let stillNothing = 0;

  for (const company of needsBackfill) {
    process.stdout.write(`${company.name} (${company.website ?? "no website"}) ... `);

    let enrichment = company.website ? await enrichCompanyFromWebsite(company.website) : null;

    let foundViaSearch = false;
    if (!enrichment?.contactName) {
      const location = [company.city, company.state].filter(Boolean).join(", ") || null;
      const dm = await findDecisionMakerViaSearch({ companyName: company.name, location });
      if (dm) {
        enrichment = overlayDecisionMaker(enrichment, dm);
        foundViaSearch = true;
      }
    }

    if (!enrichment) {
      console.log("nothing found (no website, and no search hit)");
      continue;
    }

    const email = enrichment.contactEmail || enrichment.fallbackEmail || null;
    const hasResearch = Boolean(enrichment.summary || enrichment.servicesOffered.length > 0);
    const hasContact = Boolean(
      enrichment.contactName || email || enrichment.contactPhone || enrichment.contactLinkedinUrl
    );

    if (!DRY_RUN) {
      if (hasResearch) {
        await db
          .update(companies)
          .set({
            websiteSummary: enrichment.summary || company.websiteSummary,
            servicesOffered: enrichment.servicesOffered.length > 0 ? enrichment.servicesOffered : company.servicesOffered,
            apparentSize: enrichment.apparentSize !== "unknown" ? enrichment.apparentSize : company.apparentSize,
          })
          .where(eq(companies.id, company.id));
      }

      if (hasContact) {
        await db.insert(contacts).values({
          companyId: company.id,
          name: enrichment.contactName || null,
          title: enrichment.contactTitle || (!enrichment.contactName && email ? "General inquiries" : null),
          email,
          phone: enrichment.contactPhone || null,
          linkedinUrl: enrichment.contactLinkedinUrl || null,
          isPrimary: true,
          source: "google_places",
        });
      }
    }

    if (hasResearch) enriched++;
    if (hasContact) {
      contactsCreated++;
      if (foundViaSearch) viaSearch++;
      console.log(
        `contact: ${enrichment.contactName || "(no name)"} <${email || "no email"}>` +
          (foundViaSearch ? " [via BBB/LinkedIn search]" : "")
      );
    } else {
      stillNothing++;
      console.log("still nothing found");
    }
  }

  console.log(
    `\nDone${DRY_RUN ? " (dry run, no writes)" : ""}: ${enriched} companies got research data, ` +
      `${contactsCreated} contacts created (${viaSearch} via BBB/LinkedIn search), ` +
      `${stillNothing} had nothing found at all.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill script threw:", err);
  process.exit(1);
});
