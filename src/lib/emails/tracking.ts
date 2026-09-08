import "server-only";
import crypto from "node:crypto";

/** Opaque per-message id embedded in the tracking pixel URL — random, not the message's own uuid, so guessing one open doesn't hand you every message id. */
export function generateTrackingToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Base URL for links that have to be absolute (tracking pixel, eventually
 * anything else email-embedded) — same "what's our real URL" problem the
 * /book page will hit once it starts linking itself into outreach emails.
 * NEXT_PUBLIC_APP_URL is the explicit override for a real deployment;
 * VERCEL_URL (auto-set by Vercel, no protocol) covers preview/prod without
 * one, and localhost is the last resort for local dev.
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function buildTrackingPixelUrl(token: string): string {
  return `${getAppBaseUrl()}/api/emails/track/${token}`;
}
