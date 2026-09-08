/**
 * Backfill for companies/contacts that already had email history before the
 * "Email status" section (accountIndex/threadId/trackingToken/openedAt/
 * bouncedAt columns on `messages`) shipped. Without this, the reply box on
 * the company page stays hidden for any contact whose most recent email
 * predates that deploy — it needs threadId + accountIndex on record, and
 * old rows have neither.
 *
 * What this can and can't recover, for messages already sent:
 *  - accountIndex: recoverable in full — it's exactly what emailDrafts.
 *    sentFromEmailIndex already recorded for every outbound send, and an
 *    inbound reply always lands in the same account that sent the original
 *    outreach (that's whose address the contact hit "reply" on).
 *  - threadId: recoverable for outbound sends via one Gmail API lookup per
 *    message (Gmail returns threadId for any message id, even though we
 *    only started storing it as of this feature). Inbound replies already
 *    had threadId stored by the original sync-replies code.
 *  - trackingToken / openedAt / bouncedAt: NOT recoverable. There's no
 *    tracking pixel in an email that already went out, and no way to know
 *    after the fact whether it was opened. bouncedAt stays open to a normal
 *    sync-replies run picking up an old bounce notice still sitting unread
 *    in the inbox — nothing this script needs to do.
 *
 * Safe to re-run: every pass only touches rows where the target column is
 * still null.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/backfill-message-threading.ts [--dry-run]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { eq, isNull, and, isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import { messages, emailDrafts } from "../src/db/schema";
import { getGmailMessage, type EmailAccountIndex } from "../src/lib/integrations/gmail-multi";

const DRY_RUN = process.argv.includes("--dry-run");

/** Step 1 — outbound accountIndex from the emailDraft that sent it (pure DB, no API calls). */
async function backfillOutboundAccountIndex(): Promise<number> {
  const rows = await db
    .select({ messageId: messages.id, sentFromEmailIndex: emailDrafts.sentFromEmailIndex })
    .from(messages)
    .innerJoin(emailDrafts, eq(emailDrafts.messageId, messages.id))
    .where(and(isNull(messages.accountIndex), isNotNull(emailDrafts.sentFromEmailIndex)));

  for (const row of rows) {
    if (!DRY_RUN) {
      await db
        .update(messages)
        .set({ accountIndex: row.sentFromEmailIndex })
        .where(eq(messages.id, row.messageId));
    }
  }
  return rows.length;
}

/** Step 2 — outbound threadId via one Gmail lookup per message, now that we know which account to ask. */
async function backfillOutboundThreadId(): Promise<{ updated: number; failed: number }> {
  const rows = await db.query.messages.findMany({
    where: (m, { isNull, isNotNull, and }) =>
      and(isNull(m.threadId), isNotNull(m.accountIndex), isNotNull(m.providerMessageId)),
  });

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const gmailMessage = await getGmailMessage(
        row.accountIndex as EmailAccountIndex,
        row.providerMessageId!
      );
      if (!gmailMessage.threadId) continue;
      process.stdout.write(`  message ${row.id} -> thread ${gmailMessage.threadId}\n`);
      if (!DRY_RUN) {
        await db.update(messages).set({ threadId: gmailMessage.threadId }).where(eq(messages.id, row.id));
      }
      updated++;
    } catch (err) {
      failed++;
      console.error(`  message ${row.id} (account ${row.accountIndex}): ${String(err)}`);
    }
  }
  return { updated, failed };
}

/**
 * Step 3 — anything still missing accountIndex (inbound replies, mainly —
 * the original sync-replies code stored their threadId but never their
 * accountIndex) gets it copied from another message that shares the same
 * threadId and already has one, now that step 1/2 filled those in.
 */
async function backfillRemainingAccountIndexByThread(): Promise<number> {
  const known = await db.query.messages.findMany({
    where: (m, { isNotNull, and }) => and(isNotNull(m.threadId), isNotNull(m.accountIndex)),
  });
  const accountByThread = new Map(known.map((m) => [m.threadId!, m.accountIndex!]));

  const missing = await db.query.messages.findMany({
    where: (m, { isNull, isNotNull, and }) => and(isNull(m.accountIndex), isNotNull(m.threadId)),
  });

  let updated = 0;
  for (const row of missing) {
    const accountIndex = accountByThread.get(row.threadId!);
    if (accountIndex == null) continue;
    if (!DRY_RUN) {
      await db.update(messages).set({ accountIndex }).where(eq(messages.id, row.id));
    }
    updated++;
  }
  return updated;
}

async function main() {
  console.log(`Backfilling message threading/account data${DRY_RUN ? " (dry run, no writes)" : ""}...\n`);

  const step1 = await backfillOutboundAccountIndex();
  console.log(`Step 1 — accountIndex from emailDrafts: ${step1} message(s) updated.`);

  const step2 = await backfillOutboundThreadId();
  console.log(`Step 2 — threadId via Gmail lookup: ${step2.updated} updated, ${step2.failed} failed.`);

  const step3 = await backfillRemainingAccountIndexByThread();
  console.log(`Step 3 — accountIndex copied across shared threads: ${step3} message(s) updated.`);

  console.log(
    "\nDone. Reminder: trackingToken/openedAt can't be backfilled for emails already sent — " +
      "those only apply going forward. Run the normal 'Sync Replies' action afterward to pick up " +
      "any bounce notices for these threads still sitting unread in the inbox."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill script threw:", err);
  process.exit(1);
});
