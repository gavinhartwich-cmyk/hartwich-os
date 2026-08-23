import { NextResponse } from "next/server";
import { syncReplies } from "@/lib/emails/sync-replies";

// Session-protected (proxy.ts) manual trigger — kept for the UI. The
// scheduled version lives at /api/cron/sync-replies (bearer-secret auth,
// hit on a timer by a Zo background loop instead of a logged-in browser).
export async function POST() {
  try {
    const { repliesFound, stagesUpdated, errors } = await syncReplies();

    return NextResponse.json({
      success: true,
      repliesFound,
      stagesUpdated,
      errors: errors.length > 0 ? errors : undefined,
      message: `Synced ${repliesFound} replies, updated ${stagesUpdated} deal stages`,
    });
  } catch (error) {
    console.error("Error syncing replies:", error);
    return NextResponse.json(
      { error: "Failed to sync replies", details: String(error) },
      { status: 500 }
    );
  }
}
