import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runEmailCadence } from "@/lib/emails/cadence";

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

// Same bearer-secret pattern as the other 3 cron routes (sync-replies,
// send-reminders, send-queued-emails) — public path (proxy.ts exempts
// /api/cron/*), polled on a schedule (.github/workflows/cron.yml).
//
// Runs the v1.1 email follow-up cadence: flags any Contacted deal that's
// crossed its next 3/6/9-day no-reply threshold and drafts the follow-up for
// review — see src/lib/emails/cadence.ts.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { flagged, errors } = await runEmailCadence();
    return NextResponse.json({
      success: true,
      flagged,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error running email cadence:", error);
    return NextResponse.json(
      { error: "Failed to run email cadence", details: String(error) },
      { status: 500 }
    );
  }
}
