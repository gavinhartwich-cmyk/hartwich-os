/**
 * Backfill AI-drafted outreach for companies that predate ever getting one.
 * The "Draft with AI" button on a company page (src/app/(app)/companies/
 * [id]/outreach-panel.tsx -> /api/companies/[id]/outreach) has always
 * worked for any company, old or new — but it's opt-in per company, so
 * older qualified leads that were never clicked through just sit there
 * with no draft on file. This runs the exact same drafting call
 * (draftOutreachEmail) over the backlog instead of requiring someone to
 * click through every one by hand.
 *
 * Candidates: qualified companies with an emailable contact and NO
 * existing email_drafts row at all (any status — pending, rejected, sent,
 * everything) for any of their contacts. A company that's already been
 * through this flow once is left alone; the existing duplicate-outreach
 * guard (findRecentOutreach) is what stops a second *send* to the same
 * contact, but this script stays out of that decision entirely by only
 * ever drafting for companies with zero history.
 *
 * Every draft lands as a normal pending_review row — same as clicking the
 * button — so nothing goes out without a human approving it from the
 * Email Review column on the board, same as always.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/backfill-outreach-drafts.ts [--dry-run] [--limit N]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "../src/db";
import { emailDrafts } from "../src/db/schema";
import { draftOutreachEmail } from "../src/lib/ai/draft-outreach";
import { listDealsForCompany } from "../src/lib/data/deals";

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg
  ? parseInt(limitArg.includes("=") ? limitArg.split("=")[1] : process.argv[process.argv.indexOf(limitArg) + 1], 10)
  : Infinity;

/** A short pause between AI calls — considerate of Groq's free-tier rate limit on a batch this size; structuredCompletion already retries a single 429, this just makes hitting one less likely in the first place. */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(
    `Backfilling AI outreach drafts for companies with no draft history yet` +
      `${DRY_RUN ? " (dry run, no writes/AI calls)" : ""}${LIMIT !== Infinity ? ` (limit ${LIMIT})` : ""}...\n`
  );

  const qualified = await db.query.companies.findMany({
    where: (c, { eq }) => eq(c.status, "qualified"),
    with: { contacts: true },
    orderBy: (c, { asc }) => asc(c.createdAt),
  });

  let drafted = 0;
  let skippedNoContact = 0;
  let skippedAlreadyHasDraft = 0;
  let failed = 0;

  for (const company of qualified) {
    if (drafted >= LIMIT) break;

    const contact = company.contacts.find((c) => c.isPrimary && c.email) ?? company.contacts.find((c) => c.email);
    if (!contact) {
      skippedNoContact++;
      continue;
    }

    const existingDraft = await db.query.emailDrafts.findFirst({
      where: (ed, { eq }) => eq(ed.companyId, company.id),
    });
    if (existingDraft) {
      skippedAlreadyHasDraft++;
      continue;
    }

    process.stdout.write(`${company.name} -> ${contact.name || "unnamed"} <${contact.email}> ... `);

    if (DRY_RUN) {
      console.log("would draft");
      drafted++;
      continue;
    }

    try {
      const draft = await draftOutreachEmail({
        company,
        contact,
        angle: null,
        yourName: "Gavin Hartwich",
        yourCompany: "Hartwich Labs",
      });

      const [mostRecentDeal] = await listDealsForCompany(company.id);

      await db.insert(emailDrafts).values({
        companyId: company.id,
        contactId: contact.id,
        dealId: mostRecentDeal?.id,
        subject: draft.subject,
        body: draft.body,
        status: "pending_review",
        aiRunId: draft.aiRunId,
      });

      console.log(`drafted: "${draft.subject}"`);
      drafted++;
      await sleep(300);
    } catch (err) {
      failed++;
      console.log(`FAILED: ${String(err)}`);
    }
  }

  console.log(
    `\nDone${DRY_RUN ? " (dry run)" : ""}: ${drafted} draft${drafted === 1 ? "" : "s"} ` +
      `${DRY_RUN ? "would be" : ""} created, ${skippedAlreadyHasDraft} already had draft history, ` +
      `${skippedNoContact} had no emailable contact, ${failed} failed.` +
      (!DRY_RUN && drafted > 0
        ? "\nReview them in the board's Email Review column before they send — nothing was sent automatically."
        : "")
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill script threw:", err);
  process.exit(1);
});
