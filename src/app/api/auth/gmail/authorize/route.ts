import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { buildGmailAuthUrl } from "@/lib/integrations/gmail-oauth";
import type { EmailAccountIndex } from "@/lib/integrations/gmail-multi";

const STATE_COOKIE = "gmail_oauth_state";

// Gavin-only, same gate as /ai-workforce and booking settings — these are
// the sending accounts' actual credentials, not a per-user preference.
export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const accountParam = request.nextUrl.searchParams.get("account");
  const accountIndex = Number(accountParam);
  if (![0, 1, 2].includes(accountIndex)) {
    return NextResponse.json({ error: "account must be 0, 1, or 2" }, { status: 400 });
  }

  const nonce = randomBytes(16).toString("hex");
  const url = buildGmailAuthUrl(accountIndex as EmailAccountIndex, nonce);

  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // the round trip to Google and back takes seconds, not minutes
    path: "/api/auth/gmail",
  });
  return response;
}
