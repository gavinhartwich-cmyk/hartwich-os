/**
 * One-time cleanup for duplicate company records — same business persisted
 * more than once (re-discovered under a slightly different Google Places
 * search before the sourceRefId/name dedup check existed or ran, or entered
 * manually when it already existed from discovery; manual entry never runs
 * the dedup check at all — see findDuplicateCompany in src/lib/data/
 * companies.ts).
 *
 * Finds every duplicate cluster (src/lib/data/companies.ts ->
 * findDuplicateCompanyGroups — same match rule discovery already uses:
 * normalized name or website domain), then for each group:
 *   1. picks a survivor (most deals/contacts/activities, then oldest),
 *   2. re-points every duplicate's contacts/deals/activities/tasks/
 *      bookings/email_drafts onto the survivor — nothing gets deleted out
 *      from under its own history, it just moves onto the kept record,
 *   3. deletes the now-childless duplicate company row(s).
 *
 * Contacts aren't de-duplicated against each other post-merge (a survivor
 * could end up with two contact rows for the same email) — flagged in the
 * output, left for a human to tidy since picking which contact record to
 * keep isn't as clear-cut as picking which company to keep.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/dedupe-companies.ts [--dry-run]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { companies, contacts, deals, activities, tasks, bookings, emailDrafts } from "../src/db/schema";
import { findDuplicateCompanyGroups } from "../src/lib/data/companies";

const DRY_RUN = process.argv.includes("--dry-run");

async function mergeGroup(survivorId: string, duplicateIds: string[]) {
  if (DRY_RUN) return;

  await db.transaction(async (tx) => {
    for (const table of [contacts, deals, activities, tasks, bookings, emailDrafts]) {
      await tx.update(table).set({ companyId: survivorId }).where(inArray(table.companyId, duplicateIds));
    }
    await tx.delete(companies).where(inArray(companies.id, duplicateIds));
  });
}

async function main() {
  console.log(`Scanning for duplicate companies${DRY_RUN ? " (dry run, no writes)" : ""}...\n`);

  const groups = await findDuplicateCompanyGroups();
  if (groups.length === 0) {
    console.log("No duplicates found.");
    process.exit(0);
  }

  let mergedCompanies = 0;
  for (const group of groups) {
    const survivor = await db.query.companies.findFirst({ where: eq(companies.id, group.survivorId) });
    const duplicates = await db.query.companies.findMany({
      where: inArray(companies.id, group.duplicateIds),
    });

    console.log(`Keeping "${survivor?.name}" (${group.survivorId})`);
    for (const dup of duplicates) {
      console.log(`  merging in "${dup.name}" (${dup.id}) -> deleted`);
    }

    await mergeGroup(group.survivorId, group.duplicateIds);
    mergedCompanies += duplicates.length;
    console.log();
  }

  console.log(
    `${DRY_RUN ? "Would merge" : "Merged"} ${mergedCompanies} duplicate compan${mergedCompanies === 1 ? "y" : "ies"} ` +
      `into ${groups.length} survivor${groups.length === 1 ? "" : "s"}.\n` +
      `Contacts were not de-duplicated against each other — check survivors above for repeated emails.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Dedupe script threw:", err);
  process.exit(1);
});
