import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, messages, activities } from "@/db/schema";
import { sendEmailViaGmail, getGmailMessage, extractHeader } from "@/lib/integrations/gmail-multi";
import { getReplyTargetForContact } from "@/lib/data/email-threads";
import { listDealsForCompany } from "@/lib/data/deals";

const ReplySchema = z.object({
  contactId: z.string().uuid(),
  body: z.string().trim().min(1),
  userId: z.string().uuid().optional(),
});

/**
 * POST /api/companies/[id]/emails/reply — sends a reply into an existing
 * email thread with a contact, from the company page's "Email status"
 * section. Unlike the outreach-drafting flow (/api/companies/[id]/outreach
 * -> /api/emails/approve-and-send), this is a plain, immediate send: no AI
 * draft, no approval step, no warm-up rotation — you're replying to
 * someone who already emailed you (or who you've already emailed), from
 * whichever of the 3 accounts that conversation is already on.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: companyId } = await params;
    const body = await request.json();
    const { contactId, body: replyBody, userId } = ReplySchema.parse(body);

    const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
    if (!contact || contact.companyId !== companyId) {
      return NextResponse.json({ error: "Contact not found on this company" }, { status: 404 });
    }
    if (!contact.email) {
      return NextResponse.json({ error: "This contact has no email address" }, { status: 400 });
    }

    const replyTarget = await getReplyTargetForContact(contactId);
    if (!replyTarget) {
      return NextResponse.json(
        { error: "No email thread with this contact yet — draft an outreach email first." },
        { status: 400 }
      );
    }

    // The Message-ID header (not Gmail's own message id) of whatever we're
    // replying to, so In-Reply-To/References thread correctly for mail
    // clients other than Gmail — Gmail's own threading is handled by
    // passing `threadId` straight to the send call below regardless.
    let inReplyToHeader: string | null = null;
    try {
      const original = await getGmailMessage(replyTarget.accountIndex, replyTarget.providerMessageId);
      inReplyToHeader = extractHeader(original.payload?.headers || [], "Message-Id");
    } catch (err) {
      console.error("Could not fetch original message for threading headers:", err);
    }

    const subject = replyTarget.subject
      ? /^re:/i.test(replyTarget.subject)
        ? replyTarget.subject
        : `Re: ${replyTarget.subject}`
      : "Re: your email";

    const trackingToken = crypto.randomUUID();

    const { messageId, fromAddress, threadId, rfc822MessageId } = await sendEmailViaGmail({
      to: contact.email,
      subject,
      body: replyBody,
      accountIndex: replyTarget.accountIndex,
      threadId: replyTarget.threadId,
      inReplyTo: inReplyToHeader || undefined,
      references: inReplyToHeader || undefined,
      trackingToken,
    });

    // Most recent deal for this company, same "attach to whatever's on
    // the board right now" convention as /api/companies/[id]/outreach.
    const [mostRecentDeal] = await listDealsForCompany(companyId);

    const [activity] = await db
      .insert(activities)
      .values({
        companyId,
        contactId,
        dealId: mostRecentDeal?.id,
        type: "email",
        direction: "outbound",
        bodyText: replyBody,
        aiGenerated: false,
        createdBy: userId,
      })
      .returning();

    await db.insert(messages).values({
      activityId: activity.id,
      provider: "gmail",
      providerMessageId: messageId,
      threadId,
      accountIndex: replyTarget.accountIndex,
      status: "delivered",
      toAddress: contact.email,
      fromAddress,
      subject,
      body: replyBody,
      generatedByAi: false,
      trackingToken,
      rfc822MessageId,
      deliveredAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      activityId: activity.id,
      subject,
      sentAt: activity.occurredAt,
    });
  } catch (error) {
    console.error("Error sending reply:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to send reply", details: String(error) }, { status: 500 });
  }
}
