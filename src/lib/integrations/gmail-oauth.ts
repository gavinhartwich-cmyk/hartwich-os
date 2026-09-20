import "server-only";
import { google } from "googleapis";
import { getAppUrl } from "@/lib/utils/app-url";
import type { EmailAccountIndex } from "./gmail-multi";

/**
 * The real fix for "why do we have to keep changing these tokens" (2026-09-20):
 * minting these by hand via OAuth Playground and pasting them into Vercel was
 * itself the cause. Every manual re-authorization mints a brand-new refresh
 * token against the same (client, account) pair, and Google silently retires
 * the *oldest* one once more than 50 exist for that pair — so a run of
 * troubleshooting re-auths could invalidate a token that was otherwise still
 * good, with no warning. A one-time connect flow through this app's own
 * registered redirect URI mints a token exactly once per account; this
 * client then renews it forever after (see the 'tokens' listener in
 * gmail-multi.ts), so nothing ever pushes that count up again.
 *
 * Requires GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET (already set — same client
 * used for sending) plus this redirect URI added to that OAuth client's
 * "Authorized redirect URIs" in Google Cloud Console. That's the one
 * console change this can't do on its own — everything else here is new
 * app code, not a security-setting change to the Google Cloud project.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function gmailOAuthRedirectUri(): string {
  const base = getAppUrl();
  if (!base) throw new Error("APP_URL is not set — required for the Gmail OAuth redirect URI.");
  return `${base}/api/auth/gmail/callback`;
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || "",
    process.env.GMAIL_CLIENT_SECRET || "",
    gmailOAuthRedirectUri()
  );
}

/** `state` carries the account index through the redirect round-trip — Google echoes it back unchanged on callback. */
export function buildGmailAuthUrl(accountIndex: EmailAccountIndex, state: string): string {
  const auth = getOAuthClient();
  return auth.generateAuthUrl({
    access_type: "offline",
    // Forces Google to issue a refresh token even if this Google account has
    // already granted this client access before (the common case here,
    // reconnecting) — without it a repeat consent can come back with no
    // refresh_token at all, silently leaving the stale one in place.
    prompt: "consent",
    scope: SCOPES,
    state: `${accountIndex}:${state}`,
  });
}

export type ExchangedTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

/** Exchanges the callback's `code` for tokens. Throws on failure — the caller decides how to surface it. */
export async function exchangeGmailAuthCode(code: string): Promise<ExchangedTokens> {
  const auth = getOAuthClient();
  const { tokens } = await auth.getToken(code);
  if (!tokens.access_token) {
    throw new Error("Google did not return an access token.");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}
