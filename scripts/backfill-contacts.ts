/**
 * One-time backfill for companies discovered before the Groq structured-
 * output bug fix (see the "Fix Groq 429s..." commit). Every enrichment run
 * before that fix returned null — Groq's strict JSON schema mode was
 * silently dropping the nested `decisionMaker` object, which made the
 * whole response fail Zod validation — so every existing company has no
 * website summary, no services list, and no contact.
 *
 * Re-enriches each non-disqualified company that has a website and no
 * contact yet, then fills in the same fields createDiscoveredCompany
 * would have set at discovery time.
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

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const candidates = await db.query.companies.findMany({
    where: (company, { and, ne, isNotNull }) =>
      and(ne(company.status, "disqualified"), isNotNull(company.website)),
    with: { contacts: true },
  });

  const needsBackfill = candidates.filter((c) => c.contacts.length === 0);
  console.log(`${candidates.length} active companies with a website, ${needsBackfill.length} missing a contact.\n`);

  let enriched = 0;
  let contactsCreated = 0;
  let stillNothing = 0;

  for (const company of needsBackfill) {
    process.stdout.write(`${company.name} (${company.website}) ... `);
    const enrichment = await enrichCompanyFromWebsite(company.website);

    if (!enrichment) {
      console.log("no enrichment (fetch/AI failed)");
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
      console.log(`contact: ${enrichment.contactName || "(no name)"} <${email || "no email"}>`);
    } else {
      stillNothing++;
      console.log("still nothing found on the page");
    }
  }

  console.log(
    `\nDone${DRY_RUN ? " (dry run, no writes)" : ""}: ${enriched} companies got research data, ` +
      `${contactsCreated} contacts created, ${stillNothing} had no scrapeable contact info at all.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill script threw:", err);
  process.exit(1);
});
