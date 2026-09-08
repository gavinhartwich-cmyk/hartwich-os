import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncReplies } from "@/lib/emails/sync-replies";

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

// Unauthenticated-by-session (listed in proxy.ts PUBLIC_PATHS) but
// bearer-secret protected, so a Zo background loop can hit this on a
// timer without a logged-in browser session. Same sync logic as the
// manual "Sync Replies" button — see src/lib/emails/sync-replies.ts.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { repliesFound, stagesUpdated, bouncesFound, errors } = await syncReplies();
    return NextResponse.json({
      success: true,
      repliesFound,
      stagesUpdated,
      bouncesFound,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error in cron sync-replies:", error);
    return NextResponse.json(
      { error: "Failed to sync replies", details: String(error) },
      { status: 500 }
    );
  }
}
