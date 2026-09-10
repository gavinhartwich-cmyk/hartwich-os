import "server-only";
import { db } from "@/db";
import { emailSendAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canSendEmail, shouldResetDailyCounter, getTodayMidnightWinnipeg, startsNewSendDay } from "@/lib/warmup/schedule";

export type EmailAccountIndex = 0 | 1 | 2;
const ACCOUNT_INDICES: EmailAccountIndex[] = [0, 1, 2];

type EmailSendAccountRow = typeof emailSendAccounts.$inferSelect;

/** Fetches an account's warm-up row, creating it (all-defaults) on first use — no separate seed step needed. */
async function getOrCreateAccount(accountIndex: EmailAccountIndex): Promise<EmailSendAccountRow> {
  const existing = await db.query.emailSendAccounts.findFirst({
    where: eq(emailSendAccounts.accountIndex, accountIndex),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(emailSendAccounts)
    .values({ accountIndex })
    .onConflictDoNothing()
    .returning();
  // onConflictDoNothing races with a concurrent first-use — re-read rather
  // than trust `created` if two requests both lost the insert race.
  return created ?? (await db.query.emailSendAccounts.findFirst({ where: eq(emailSendAccounts.accountIndex, accountIndex) }))!;
}

/** Rolls a stale daily counter over to today (Winnipeg midnight) if needed, applying the reset in-memory + persisting it. */
async function withFreshDailyCount(account: EmailSendAccountRow): Promise<EmailSendAccountRow> {
  if (!shouldResetDailyCounter(account.lastSendResetAt)) return account;

  const lastSendResetAt = getTodayMidnightWinnipeg();
  await db
    .update(emailSendAccounts)
    .set({ dailySendCount: 0, lastSendResetAt, updatedAt: new Date() })
    .where(eq(emailSendAccounts.accountIndex, account.accountIndex));
  return { ...account, dailySendCount: 0, lastSendResetAt };
}

/**
 * Finds the next account (continuing round-robin from whichever sent last,
 * globally) that currently has capacity — under its daily cap for today's
 * warm-up phase, and past the minimum spacing since its last send. Returns
 * null if all 3 accounts are currently capped out or too-soon-since-last-send.
 */
export async function pickAvailableAccount(): Promise<EmailAccountIndex | null> {
  const lastSent = await db.query.emailDrafts.findFirst({
    where: (ed, { eq }) => eq(ed.status, "sent"),
    orderBy: (ed, { desc }) => desc(ed.sentAt),
  });
  const startAfter = (lastSent?.sentFromEmailIndex as EmailAccountIndex | null) ?? 2; // so the first candidate checked is 0 when nothing's ever been sent

  for (let offset = 1; offset <= 3; offset++) {
    const candidate = ((startAfter + offset) % 3) as EmailAccountIndex;
    const fresh = await withFreshDailyCount(await getOrCreateAccount(candidate));
    const { allowed } = canSendEmail(fresh.warmupStatus, fresh.dailySendCount, fresh.activeSendDays, fresh.lastSentAt);
    if (allowed) return candidate;
  }

  return null;
}

/**
 * Resolves which mailbox a draft should send from. A reply (kind='reply')
 * must go out from whichever mailbox received the message it's answering —
 * not the warm-up round robin — since responding to an already-engaged
 * prospect isn't cold volume and there's exactly one right account (the one
 * that owns the Gmail thread). Falls back to the normal rotation for every
 * other kind, and even for a reply whose original message somehow has no
 * recorded accountIndex (pre-v1.1 data).
 */
export async function resolveAccountForDraft(draft: {
  kind: string;
  inReplyToMessageId: string | null;
}): Promise<EmailAccountIndex | null> {
  if (draft.kind === "reply" && draft.inReplyToMessageId) {
    const original = await db.query.messages.findFirst({
      where: (m, { eq }) => eq(m.id, draft.inReplyToMessageId!),
    });
    if (original?.accountIndex != null) {
      return original.accountIndex as EmailAccountIndex;
    }
  }
  return pickAvailableAccount();
}

/** Whether `accountIndex` specifically has capacity right now (used to report exact reasons, not just pick a winner). */
export async function checkAccountCapacity(
  accountIndex: EmailAccountIndex
): Promise<{ allowed: boolean; reason?: string }> {
  const fresh = await withFreshDailyCount(await getOrCreateAccount(accountIndex));
  return canSendEmail(fresh.warmupStatus, fresh.dailySendCount, fresh.activeSendDays, fresh.lastSentAt);
}

/** Records a real send against an account: bumps its daily count, advances the warm-up ramp on the day's first send, stamps lastSentAt for spacing. */
export async function recordEmailSent(accountIndex: EmailAccountIndex): Promise<void> {
  const fresh = await withFreshDailyCount(await getOrCreateAccount(accountIndex));
  const now = new Date();

  // The ramp advances per *sending* day, so only the day's first send moves
  // it — later sends the same day count toward the daily cap but not toward
  // warm-up progress.
  const newSendDay = startsNewSendDay(fresh.lastSentAt, now);

  await db
    .update(emailSendAccounts)
    .set({
      dailySendCount: fresh.dailySendCount + 1,
      activeSendDays: fresh.activeSendDays + (newSendDay ? 1 : 0),
      lastSentAt: now,
      warmupStatus: fresh.warmupStatus === "not_started" ? "warming_up" : fresh.warmupStatus,
      warmupStartedAt: fresh.warmupStartedAt ?? now,
      updatedAt: now,
    })
    .where(eq(emailSendAccounts.accountIndex, accountIndex));
}

export { ACCOUNT_INDICES };
