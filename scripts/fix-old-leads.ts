/**
 * v1.1 lead cleanup ("fix the old leads"): companies discovered before AI
 * email drafting existed have no contact with an email address, so
 * draftOutreachEmail() can never run for them — dead weight on the board.
 * Also cleans up duplicate companies left over from discovery runs before
 * dedup logic existed (see findDuplicateCompany in src/lib/data/companies.ts,
 * which only guards *new* discoveries against *existing* ones, never swept
 * the existing set against itself).
 *
 * Two passes:
 *   1. Every non-disqualified company with no emailable contact gets a
 *      fresh enrichCompanyFromWebsite() pass. Finds an email -> keeps the
 *      company (now usable). Still nothing (no website, or enrichment finds
 *      nothing) -> deleted.
 *   2. Companies are grouped by normalized name / website domain (same
 *      normalization findDuplicateCompany uses). Per group, the company
 *      that (a) has an emailable contact, else (b) has a deal on the board,
 *      else (c) is most recently created is kept; every contact on the
 *      losing duplicates is re-parented onto the keeper before the losers
 *      are deleted, so no contact data is lost.
 *
 * "server-only" throws when required outside Next's build (see
 * backfill-contacts.ts) — run with:
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/fix-old-leads.ts --dry-run
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { eq, ne, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { companies, contacts } from "../src/db/schema";
import { enrichCompanyFromWebsite } from "../src/lib/ai/enrich-company";
import { normalizeCompanyName, websiteDomain } from "../src/lib/data/companies";

const DRY_RUN = process.argv.includes("--dry-run");

type Contact = { id: string; email: string | null };
type Deal = { stage: { isWon: boolean; isLost: boolean } };
type Company = {
  id: string;
  name: string;
  website: string | null;
  createdAt: Date;
  contacts: Contact[];
  deals: Deal[];
};

function hasEmail(c: Company): boolean {
  return c.contacts.some((ct) => ct.email);
}
function hasOpenDeal(c: Company): boolean {
  return c.deals.some((d) => !d.stage.isWon && !d.stage.isLost);
}

// Simple union-find so a name match and a separate domain match can chain
// three-plus companies into one group even when not every pair matches
// both ways.
function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  return { find, union };
}

async function main() {
  const all = (await db.query.companies.findMany({
    where: ne(companies.status, "disqualified"),
    with: {
      contacts: { columns: { id: true, email: true } },
      deals: { with: { stage: { columns: { isWon: true, isLost: true } } } },
    },
  })) as Company[];

  console.log(`${all.length} active (non-disqualified) companies.\n`);

  // ---------------------------------------------------------------------
  // Pass 1: fix or condemn every company with no emailable contact.
  // ---------------------------------------------------------------------
  const missingEmail = all.filter((c) => !hasEmail(c));
  console.log(`${missingEmail.length} have no contact with an email address.\n`);

  const toDelete = new Set<string>();
  const contactsToCreate: { companyId: string; email: string; name: string | null; title: string | null; phone: string | null; linkedinUrl: string | null }[] = [];

  for (const company of missingEmail) {
    if (!company.website) {
      console.log(`  DELETE  ${company.name} — no website, no contact, unfixable`);
      toDelete.add(company.id);
      continue;
    }

    process.stdout.write(`  re-enriching  ${company.name} (${company.website}) ... `);
    const enrichment = await enrichCompanyFromWebsite(company.website);
    const email = enrichment?.contactEmail || enrichment?.fallbackEmail || null;

    if (!email) {
      console.log("still no email found — DELETE");
      toDelete.add(company.id);
      continue;
    }

    console.log(`found ${email} — KEEP, contact will be created`);
    contactsToCreate.push({
      companyId: company.id,
      email,
      name: enrichment?.contactName || null,
      title: enrichment?.contactTitle || (!enrichment?.contactName ? "General inquiries" : null),
      phone: enrichment?.contactPhone || null,
      linkedinUrl: enrichment?.contactLinkedinUrl || null,
    });
    // Reflect the fix in-memory so pass 2's dedup keeper-selection sees this
    // company as having an email too.
    company.contacts.push({ id: "pending", email });
  }

  if (!DRY_RUN && contactsToCreate.length > 0) {
    await db.insert(contacts).values(
      contactsToCreate.map((c) => ({
        companyId: c.companyId,
        name: c.name,
        title: c.title,
        email: c.email,
        phone: c.phone,
        linkedinUrl: c.linkedinUrl,
        isPrimary: true,
        source: "manual" as const,
      }))
    );
  }

  // ---------------------------------------------------------------------
  // Pass 2: duplicate detection across the full active set (post-fix state).
  // ---------------------------------------------------------------------
  const survivors = all.filter((c) => !toDelete.has(c.id));
  const { find, union } = makeUnionFind(survivors.length);
  const byName = new Map<string, number[]>();
  const byDomain = new Map<string, number[]>();

  survivors.forEach((c, i) => {
    const n = normalizeCompanyName(c.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), i]);
    const d = websiteDomain(c.website);
    if (d) byDomain.set(d, [...(byDomain.get(d) ?? []), i]);
  });
  for (const idxs of [...byName.values(), ...byDomain.values()]) {
    for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
  }

  const groups = new Map<number, number[]>();
  survivors.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);

  console.log(`\n${duplicateGroups.length} duplicate group(s) found among survivors.\n`);

  const reparentOps: { loserId: string; keeperId: string }[] = [];

  for (const group of duplicateGroups) {
    const ranked = group
      .map((i) => survivors[i])
      .sort((a, b) => {
        const ae = hasEmail(a) ? 1 : 0;
        const be = hasEmail(b) ? 1 : 0;
        if (ae !== be) return be - ae;
        const ad = hasOpenDeal(a) ? 1 : 0;
        const bd = hasOpenDeal(b) ? 1 : 0;
        if (ad !== bd) return bd - ad;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    const [keeper, ...losers] = ranked;

    console.log(`  KEEP  ${keeper.name} (${keeper.id})`);
    for (const loser of losers) {
      console.log(`    merge+DELETE  ${loser.name} (${loser.id}) — contacts moved to keeper`);
      reparentOps.push({ loserId: loser.id, keeperId: keeper.id });
      toDelete.add(loser.id);
    }
  }

  if (!DRY_RUN) {
    for (const { loserId, keeperId } of reparentOps) {
      await db.update(contacts).set({ companyId: keeperId }).where(eq(contacts.companyId, loserId));
    }
    if (toDelete.size > 0) {
      await db.delete(companies).where(inArray(companies.id, [...toDelete]));
    }
  }

  console.log(
    `\nDone${DRY_RUN ? " (dry run, no writes)" : ""}: ${contactsToCreate.length} contact(s) ` +
      `${DRY_RUN ? "would be" : "were"} created, ${reparentOps.length} contact set(s) ${DRY_RUN ? "would be" : "were"} re-parented, ` +
      `${toDelete.size} compan${toDelete.size === 1 ? "y" : "ies"} ${DRY_RUN ? "would be" : "were"} deleted.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("fix-old-leads script threw:", err);
  process.exit(1);
});
