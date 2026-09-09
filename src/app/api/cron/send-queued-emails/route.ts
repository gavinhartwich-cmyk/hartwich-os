import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { resolveAccountForDraft } from "@/lib/data/email-accounts";
import { sendApprovedDraft } from "@/lib/emails/send-approved-draft";

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return constantTimeEqual(auth.slice(7), secret);
}

// Cap how many one run tries, so a large backlog can't turn into one
// giant slow request — the next scheduled run picks up wherever this one
// stopped.
const BATCH_LIMIT = 50;

// Same shape as /api/cron/sync-replies and /api/cron/send-reminders: public
// path (proxy.ts exempts /api/cron/*) but bearer-secret protected, polled
// on a schedule (.github/workflows/cron.yml).
//
// Flushes email_drafts left in status='approved' with no sentAt — approved
// by a reviewer, but every rotating Gmail account was at its warm-up daily
// cap or too-soon-since-last-send at approval time (see
// src/lib/warmup/schedule.ts, src/lib/data/email-accounts.ts). Without this,
// those approvals would just sit there forever; the reviewer shouldn't have
// to remember to come back and re-click send once capacity frees up.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const queued = await db.query.emailDrafts.findMany({
      where: (ed, { eq, isNull, and }) => and(eq(ed.status, "approved"), isNull(ed.sentAt)),
      orderBy: (ed, { asc }) => asc(ed.approvedAt),
      limit: BATCH_LIMIT,
      with: { contact: true },
    });

    let sent = 0;
    const errors: string[] = [];

    for (const draft of queued) {
      const accountIndex = await resolveAccountForDraft(draft);
      if (accountIndex === null) break; // every account capped right now — stop; next run picks up here

      if (!draft.approvedBy) {
        // Shouldn't happen (approve-and-send always sets it before this
        // status is reachable) — skip rather than send with no attribution.
        errors.push(`Draft ${draft.id} has no approvedBy — skipping`);
        continue;
      }

      try {
        await sendApprovedDraft(draft, draft.subject, draft.body, accountIndex, draft.approvedBy);
        sent++;
      } catch (err) {
        errors.push(`Draft ${draft.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      stillQueued: queued.length - sent - errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error flushing queued emails:", error);
    return NextResponse.json(
      { error: "Failed to flush queued emails", details: String(error) },
      { status: 500 }
    );
  }
}
