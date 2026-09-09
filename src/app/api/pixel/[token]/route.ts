import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// A real 1x1 transparent GIF, not a fake/empty response — some mail clients
// verify the image actually decodes before treating it as "loaded", which
// gates whether this fires at all.
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
);

const PIXEL_RESPONSE_HEADERS = {
  "Content-Type": "image/gif",
  "Content-Length": String(TRANSPARENT_GIF.length),
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

/**
 * GET /api/pixel/[token] — the v1.1 email open-tracking pixel. Embedded as
 * a hidden <img> in the HTML part of every outbound email sent after this
 * shipped (src/lib/integrations/gmail-multi.ts) — can't be retrofitted onto
 * mail already sent, per the original ask.
 *
 * Always returns the pixel, even when the token doesn't match anything or
 * the DB write fails — a recipient's mail client must never see a broken
 * image or a slow/erroring request just because our tracking had a hiccup.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    await db
      .update(messages)
      .set({
        openedAt: sql`coalesce(${messages.openedAt}, now())`,
        openCount: sql`${messages.openCount} + 1`,
      })
      .where(eq(messages.trackingToken, token));
  } catch (error) {
    console.error("Pixel tracking update failed:", error);
  }

  return new NextResponse(TRANSPARENT_GIF, { status: 200, headers: PIXEL_RESPONSE_HEADERS });
}
