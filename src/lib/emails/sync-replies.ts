import "server-only";
import { db } from "@/db";
import { activities, messages, deals, contacts, emailDrafts } from "@/db/schema";
import {
  getUnreadMessages,
  getGmailMessage,
  extractFromAddress,
  extractHeader,
  extractPlainTextBody,
  extractAllMessageText,
  markMessageRead,
} from "@/lib/integrations/gmail-multi";
import type { EmailAccountIndex } from "@/lib/data/email-accounts";
import { findStageByName, PIPELINE_STAGE_NAMES } from "@/lib/data/pipeline-stages";
import { moveDealStage } from "@/lib/data/deals";
import { draftReplyEmail } from "@/lib/ai/draft-outreach";
import { enrichCompanyFromWebsite } from "@/lib/ai/enrich-company";
import { notifyOps } from "@/lib/notifications/notify";
import { companyUrl } from "@/lib/utils/app-url";
import { eq, and, gte, isNull, inArray } from "drizzle-orm";

export type SyncRepliesResult = {
  repliesFound: number;
  stagesUpdated: number;
  bouncesFound: number;
  errors: string[];
};

const BOUNCE_LOOKBACK_DAYS = 7;

function isBounceNotification(fromAddress: string, subject: string | null): boolean {
  const from = fromAddress.toLowerCase();
  const s = (subject ?? "").toLowerCase();

  // Gmail (and most MTAs) send a *temporary* delay notice from the exact
  // same mailer-daemon address, with a subject nearly identical to a final
  // failure ("Delivery Status Notification (Delay)" vs "(Failure)", or a
  // bare "Delivery incomplete" that explicitly says it's still retrying) —
  // treating that as a bounce flags the deal and re-searches for a
  // "corrected" address the original send never actually needed.
  if (/\bdelay(ed)?\b|incomplete|will retry|temporar(y|ily)/.test(s)) return false;

  if (from.startsWith("mailer-daemon@") || from.startsWith("postmaster@")) return true;
  return (
    s.includes("delivery status notification") ||
    s.includes("undelivered mail") ||
    s.includes("delivery failure") ||
    s.includes("mail delivery failed") ||
    s.includes("returned to sender")
  );
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Best-effort extraction of the address a bounce notification is actually
 * about, from the DSN body text. There's no structured field we can rely on
 * across every provider's bounce format, so this just collects every
 * email-shaped string in the body and lets the caller match candidates
 * against our own recent sends — the real filter is "did we send to this
 * address recently," not "is this definitely the failed recipient field."
 */
function candidateBouncedAddresses(bodyText: string): string[] {
  const found = new Set<string>();
  for (const m of bodyText.matchAll(EMAIL_RE)) {
    const addr = m[0].toLowerCase();
    if (addr.startsWith("mailer-daemon@") || addr.startsWith("postmaster@")) continue;
    found.add(addr);
  }
  return [...found];
}

/**
 * Handles one bounce-notification message: matches it back to a recent
 * outbound email by recipient address, marks that message bounced, flags
 * the deal for review, and re-runs website enrichment to try to find a
 * working address — per the original ask ("if bounced the ai does another
 * search for the proper email"). Best-effort throughout: Gmail's send API
 * gives no real delivery/bounce callback, so this is scanning DSN-shaped
 * mail in the same inbox poll used for replies, not a guaranteed catch.
 */
async function handleBounceNotification(fullMsg: Awaited<ReturnType<typeof getGmailMessage>>): Promise<void> {
  const bodyText = extractAllMessageText(fullMsg);
  const candidates = candidateBouncedAddresses(bodyText);
  if (candidates.length === 0) return;

  const cutoff = new Date(Date.now() - BOUNCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const bounced = await db.query.messages.findFirst({
    where: and(
      eq(messages.provider, "gmail"),
      gte(messages.createdAt, cutoff),
      isNull(messages.bouncedAt),
      inArray(messages.toAddress, candidates)
    ),
    orderBy: (m, { desc }) => desc(m.createdAt),
    with: { activity: { with: { deal: true, company: true, contact: true } } },
  });
  if (!bounced) return;

  const reason = bodyText.slice(0, 500);
  await db
    .update(messages)
    .set({ status: "bounced", bouncedAt: new Date(), bounceReason: reason })
    .where(eq(messages.id, bounced.id));

  const { company, deal, contactId } = bounced.activity;
  if (deal) {
    await db
      .update(deals)
      .set({ followUpFlaggedAt: new Date(), updatedAt: new Date() })
      .where(eq(deals.id, deal.id));
  }

  const enrichment = company.website ? await enrichCompanyFromWebsite(company.website) : null;
  const newEmail = enrichment?.contactEmail || enrichment?.fallbackEmail || null;
  const foundDifferentAddress = newEmail && newEmail.toLowerCase() !== bounced.toAddress?.toLowerCase();

  if (foundDifferentAddress && deal) {
    const [newContact] = await db.transaction(async (tx) => {
      await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.companyId, company.id));
      return tx
        .insert(contacts)
        .values({
          companyId: company.id,
          name: enrichment!.contactName || null,
          title: enrichment!.contactTitle || null,
          email: newEmail,
          phone: enrichment!.contactPhone || null,
          linkedinUrl: enrichment!.contactLinkedinUrl || null,
          isPrimary: true,
          source: "manual",
        })
        .returning();
    });

    await db.insert(emailDrafts).values({
      companyId: company.id,
      contactId: newContact.id,
      dealId: deal.id,
      subject: bounced.subject || `Following up: ${company.name}`,
      body: bounced.body || "",
      status: "pending_review",
      kind: "bounce_correction",
    });
  }

  await db.insert(activities).values({
    companyId: company.id,
    contactId: contactId,
    dealId: deal?.id ?? null,
    type: "email",
    direction: "inbound",
    bodyText: foundDifferentAddress
      ? `Original email to ${bounced.toAddress} bounced. Found a different address (${newEmail}) — a corrected draft is waiting for review.`
      : `Original email to ${bounced.toAddress} bounced. Re-ran website research but found no other contact address — needs manual research.`,
    aiGenerated: false,
  });

  const link = companyUrl(company.id);
  await notifyOps(
    `${company.name}: email bounced`,
    (foundDifferentAddress
      ? `The outreach email to ${bounced.toAddress} bounced. Found a different address (${newEmail}) and queued a corrected draft for review.`
      : `The outreach email to ${bounced.toAddress} bounced. Re-searched the company's website but couldn't find another contact address — needs manual research.`) +
      (link ? `\n\n${link}` : "")
  );
}

/**
 * Core Gmail reply/bounce-sync logic (Phase 3/4, reworked for v1.1), shared
 * by the session-protected manual-trigger route (src/app/api/emails/sync-replies)
 * and the bearer-secret cron route (src/app/api/cron/sync-replies) polled on
 * a schedule. For each of the 3 rotating Gmail accounts' unread mail:
 *
 * - A bounce-notification-shaped message runs handleBounceNotification.
 * - Anything else is matched back to one of our own sent emails by Gmail
 *   **threadId** (not the old In-Reply-To-header match, which compared two
 *   different ID spaces and could never succeed — see the v1.1 changelog).
 *   A match logs the reply, moves the deal to Engaged, and drafts an
 *   AI response for review.
 */
export async function syncReplies(): Promise<SyncRepliesResult> {
  let repliesFound = 0;
  let stagesUpdated = 0;
  let bouncesFound = 0;
  const errors: string[] = [];

  for (let accountIndex = 0; accountIndex < 3; accountIndex++) {
    try {
      const unreadResponse = await getUnreadMessages(accountIndex as EmailAccountIndex);
      if (!unreadResponse.messages) continue;

      for (const msgRef of unreadResponse.messages) {
        try {
          const fullMsg = await getGmailMessage(accountIndex as EmailAccountIndex, msgRef.id!);
          const headers = fullMsg.payload?.headers || [];
          const fromAddress = extractFromAddress(headers);
          const subjectHeader = extractHeader(headers, "Subject");
          const rfc822MessageId = extractHeader(headers, "Message-Id");
          const threadId = fullMsg.threadId ?? null;

          if (isBounceNotification(fromAddress, subjectHeader)) {
            await handleBounceNotification(fullMsg);
            bouncesFound++;
            // Mark it read regardless of whether a match was found — either
            // way we've fully evaluated this notification; nothing left to
            // learn by re-fetching and re-scanning it again next run.
            await markMessageRead(accountIndex as EmailAccountIndex, msgRef.id!);
            continue;
          }

          if (!threadId) continue;

          // Already processed on a prior run? `is:unread` keeps returning a
          // message until markMessageRead below actually clears the label —
          // this is the belt-and-suspenders check for when that call failed
          // (or hasn't happened yet on an in-flight run), so a flaky Gmail
          // API response never turns into a duplicate AI-drafted reply and
          // a duplicate ops-notification email sent to Noa.
          const alreadyProcessed = await db.query.messages.findFirst({
            where: and(eq(messages.provider, "gmail"), eq(messages.providerMessageId, msgRef.id!)),
          });
          if (alreadyProcessed) {
            await markMessageRead(accountIndex as EmailAccountIndex, msgRef.id!);
            continue;
          }

          const sentMessage = await db.query.messages.findFirst({
            where: and(eq(messages.provider, "gmail"), eq(messages.threadId, threadId)),
            orderBy: (m, { desc }) => desc(m.createdAt),
            with: {
              activity: {
                with: {
                  deal: { with: { stage: true } },
                  company: true,
                  contact: true,
                },
              },
            },
          });

          if (!sentMessage) continue; // not a thread we started — not ours to act on

          const replyBody = extractPlainTextBody(fullMsg) ?? "Reply received";

          const [replyActivity] = await db
            .insert(activities)
            .values({
              companyId: sentMessage.activity.companyId,
              contactId: sentMessage.activity.contactId,
              dealId: sentMessage.activity.dealId,
              type: "email",
              direction: "inbound",
              bodyText: replyBody,
              aiGenerated: false,
            })
            .returning();

          const [inboundMessage] = await db
            .insert(messages)
            .values({
              activityId: replyActivity.id,
              provider: "gmail",
              providerMessageId: msgRef.id!,
              threadId,
              status: "replied",
              fromAddress,
              toAddress: sentMessage.toAddress,
              subject: subjectHeader || `Re: ${sentMessage.subject}`,
              body: replyBody,
              generatedByAi: false,
              rfc822MessageId,
              accountIndex,
            })
            .returning();

          repliesFound++;

          await db.update(messages).set({ status: "replied" }).where(eq(messages.id, sentMessage.id));

          const deal = sentMessage.activity.deal;
          if (deal) {
            await db
              .update(deals)
              .set({ lastInboundEmailAt: new Date(), followUpFlaggedAt: null, updatedAt: new Date() })
              .where(eq(deals.id, deal.id));

            const engagedStage = await findStageByName(PIPELINE_STAGE_NAMES.ENGAGED);
            if (engagedStage && deal.stageId !== engagedStage.id) {
              await moveDealStage(deal.id, engagedStage.id);
              stagesUpdated++;
            }

            const contactId = sentMessage.activity.contactId;
            if (!contactId) {
              errors.push(`Reply on message ${msgRef.id} has no known contact — can't draft a response.`);
            } else {
              try {
                const draft = await draftReplyEmail({
                  company: sentMessage.activity.company,
                  contact: sentMessage.activity.contact,
                  originalSubject: sentMessage.subject || "",
                  replyText: replyBody,
                  yourName: "Gavin Hartwich",
                  yourCompany: "Hartwich Labs",
                });

                await db.insert(emailDrafts).values({
                  companyId: sentMessage.activity.companyId,
                  contactId,
                  dealId: deal.id,
                  subject: draft.subject,
                  body: draft.body,
                  status: "pending_review",
                  kind: "reply",
                  inReplyToMessageId: inboundMessage.id,
                  aiRunId: draft.aiRunId,
                });

                const link = companyUrl(sentMessage.activity.companyId);
                await notifyOps(
                  `${sentMessage.activity.company.name} replied`,
                  `${sentMessage.activity.company.name} replied to your outreach email and moved to Engaged. An AI-drafted response is waiting for your review.` +
                    (link ? `\n\n${link}` : "")
                );
              } catch (draftErr) {
                errors.push(`Failed to draft reply for message ${msgRef.id}: ${String(draftErr)}`);
              }
            }
          }

          await markMessageRead(accountIndex as EmailAccountIndex, msgRef.id!);
        } catch (msgErr) {
          errors.push(`Failed to process message ${msgRef.id}: ${String(msgErr)}`);
        }
      }
    } catch (accountErr) {
      errors.push(`Failed to sync account ${accountIndex + 1}: ${String(accountErr)}`);
    }
  }

  return { repliesFound, stagesUpdated, bouncesFound, errors };
}
