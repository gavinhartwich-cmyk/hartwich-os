import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendDailyReportIfDue } from "@/lib/reports/send-daily-report";

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

// Same bearer-secret pattern as the other cron routes — polled every 15
// minutes by .github/workflows/cron.yml, all day. sendDailyReportIfDue
// decides whether it's actually past 5pm and whether today's report already
// went out; most calls to this route are a no-op by design.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendDailyReportIfDue();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error sending daily report:", error);
    return NextResponse.json(
      { error: "Failed to send daily report", details: String(error) },
      { status: 500 }
    );
  }
}
