import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailSendAccounts } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { exchangeGmailAuthCode } from "@/lib/integrations/gmail-oauth";

const STATE_COOKIE = "gmail_oauth_state";
const SETTINGS_PATH = "/settings/email-accounts";

function redirectWithMessage(request: NextRequest, key: "connected" | "error", detail?: string): NextResponse {
  const url = new URL(SETTINGS_PATH, request.url);
  url.searchParams.set(key, detail ?? "1");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    return redirectWithMessage(request, "error", `Google returned: ${error}`);
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedNonce = request.cookies.get("gmail_oauth_state")?.value;
  const [accountPart, nonce] = (state ?? "").split(":");
  const accountIndex = Number(accountPart);

  if (!code || !state || !expectedNonce || nonce !== expectedNonce || ![0, 1, 2].includes(accountIndex)) {
    return redirectWithMessage(request, "error", "Invalid or expired authorization state — try connecting again.");
  }

  try {
    const tokens = await exchangeGmailAuthCode(code);

    await db
      .insert(emailSendAccounts)
      .values({
        accountIndex,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      })
      .onConflictDoUpdate({
        target: emailSendAccounts.accountIndex,
        set: {
          accessToken: tokens.accessToken,
          // A re-consent doesn't always return a fresh refresh token (Google
          // omits it when one's already outstanding for this exact client +
          // scope combination) — keep the existing one rather than blanking
          // out a still-good credential.
          ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
          tokenExpiresAt: tokens.expiresAt,
          updatedAt: new Date(),
        },
      });

    const response = redirectWithMessage(request, "connected");
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error(`Gmail OAuth callback failed (account ${accountIndex}):`, err);
    return redirectWithMessage(request, "error", err instanceof Error ? err.message : String(err));
  }
}
