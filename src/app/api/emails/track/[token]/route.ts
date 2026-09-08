import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq } from "drizzle-orm";

// A 1x1 transparent GIF — the actual tracking pixel. Served unconditionally
// (even for an unknown/expired token) so a broken lookup never shows up as
// a broken image in the recipient's inbox.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);

const PIXEL_RESPONSE_INIT = {
  status: 200,
  headers: {
    "Content-Type": "image/gif",
    "Content-Length": String(PIXEL.length),
    // Mail clients cache aggressively otherwise, and a cached pixel never
    // re-fires the request — no signal for a second open.
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
};

/**
 * GET /api/emails/track/[token] — the open-tracking pixel embedded in every
 * HTML email we send (src/lib/integrations/gmail-multi.ts). Public route
 * (listed in src/proxy.ts PUBLIC_PATHS) — the requester is the recipient's
 * mail client/image proxy, never a logged-in session.
 *
 * Only ever escalates status forward (sent/delivered -> opened), and only
 * stamps openedAt once — a reply or a bounce that arrives after the first
 * open is a more specific signal than "was it opened", so this never
 * downgrades either back to "opened".
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const message = await db.query.messages.findFirst({
      where: (m, { eq }) => eq(m.trackingToken, token),
    });

    if (message && (message.status === "sent" || message.status === "delivered")) {
      await db
        .update(messages)
        .set({ status: "opened", openedAt: message.openedAt ?? new Date() })
        .where(eq(messages.id, message.id));
    }
  } catch (error) {
    // Never let a tracking failure surface as a broken image or an error
    // page — this endpoint's only job is "record the open if we can".
    console.error("Error recording email open:", error);
  }

  return new NextResponse(PIXEL, PIXEL_RESPONSE_INIT);
}
