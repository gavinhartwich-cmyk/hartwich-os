import "server-only";
import crypto from "node:crypto";
import { google } from "googleapis";
import { getAppUrl } from "@/lib/utils/app-url";

/**
 * Multi-account Gmail integration for sending outreach emails from 3 accounts.
 * 
 * Supports:
 * - GMAIL_ACCESS_TOKEN_1, GMAIL_ACCESS_TOKEN_2, GMAIL_ACCESS_TOKEN_3
 * - GMAIL_REFRESH_TOKEN_1, GMAIL_REFRESH_TOKEN_2, GMAIL_REFRESH_TOKEN_3
 * - Account rotation (round-robin load balancing)
 * - Reply detection across all accounts
 */

export type EmailAccountIndex = 0 | 1 | 2;

// Initialize Gmail API client for a specific account
function getGmailClient(accountIndex: EmailAccountIndex) {
  const accessTokenKey = `GMAIL_ACCESS_TOKEN_${accountIndex + 1}`;
  const refreshTokenKey = `GMAIL_REFRESH_TOKEN_${accountIndex + 1}`;
  const accessToken = process.env[accessTokenKey];

  if (!accessToken) {
    throw new Error(`${accessTokenKey} not set in environment variables`);
  }

  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || "",
    process.env.GMAIL_CLIENT_SECRET || ""
  );

  auth.setCredentials({
    access_token: accessToken,
    refresh_token: process.env[refreshTokenKey],
  });

  return google.gmail({ version: "v1", auth });
}

/**
 * Get the "from" email address for an account index
 */
export function getFromEmailForAccount(accountIndex: EmailAccountIndex): string {
  const accountKey = `GMAIL_FROM_ADDRESS_${accountIndex + 1}`;
  return process.env[accountKey] || `hartwich-os-account-${accountIndex + 1}@gmail.com`;
}

/**
 * RFC 2047 "encoded word" for a header value that isn't plain ASCII.
 * Email headers are ASCII-only per RFC 5322 — an AI-drafted subject with a
 * smart quote or em dash embedded as raw UTF-8 bytes gets the whole
 * message rejected by Gmail's API rather than just mangling that character.
 */
function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/**
 * Turns a plain-text draft body into minimal HTML for the multipart
 * alternative part: blank-line-separated paragraphs become <p>, single
 * newlines within a paragraph become <br>. Escapes HTML special characters
 * first so nothing in an AI-drafted body (an "&" or a stray "<") breaks the
 * markup or gets interpreted as a tag.
 */
function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br>"));
  return paragraphs.map((p) => `<p style="margin:0 0 1em 0;">${p}</p>`).join("\n");
}

/**
 * Send an email via Gmail API from a specific account.
 *
 * Always sends multipart/alternative (a plain-text part plus an HTML part)
 * rather than plain text-only, for two reasons introduced in v1.1:
 * - `trackingToken`, when given, gets a 1x1 pixel (src/app/api/pixel/[token])
 *   appended to the HTML part — this is what powers open tracking. It can
 *   only live in the HTML part; a plain-text email has nowhere to hide it.
 * - `inReplyTo`/`references`/`threadId`, when given, thread this send into
 *   an existing Gmail conversation instead of starting a new one — used for
 *   AI-drafted replies to an inbound message (see send-approved-draft.ts).
 *
 * Returns the real RFC822 Message-ID header (distinct from Gmail's internal
 * message id) and threadId alongside the existing messageId/fromAddress —
 * both needed to correctly thread a *later* reply to this message.
 */
export async function sendEmailViaGmail({
  to,
  subject,
  body,
  accountIndex = 0,
  trackingToken,
  inReplyTo,
  references,
  threadId,
}: {
  to: string;
  subject: string;
  body: string;
  accountIndex?: EmailAccountIndex;
  /** Pixel token for open tracking — omit for a message that shouldn't carry one. */
  trackingToken?: string | null;
  /** RFC822 Message-ID of the message this is replying to, for correct in-client threading. */
  inReplyTo?: string | null;
  /** Same value as inReplyTo in the simple one-hop case — kept as a separate param for a future multi-hop thread. */
  references?: string | null;
  /** Gmail threadId to attach this send to, so it lands in the same conversation. */
  threadId?: string | null;
}): Promise<{ messageId: string; fromAddress: string; threadId: string | null; rfc822MessageId: string | null }> {
  try {
    const gmail = getGmailClient(accountIndex);
    const fromAddress = getFromEmailForAccount(accountIndex);

    const boundary = `----=_HartwichOS_${crypto.randomBytes(12).toString("hex")}`;

    const base = getAppUrl();
    const pixelUrl = trackingToken && base ? `${base}/api/pixel/${trackingToken}` : null;
    const htmlBody =
      plainTextToHtml(body) +
      (pixelUrl
        ? `\n<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;" />`
        : "");

    const headers = [
      `From: ${fromAddress}`,
      `To: ${to}`,
      `Subject: ${encodeHeaderValue(subject)}`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
      references ? `References: ${references}` : null,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].filter((line): line is string => line !== null);

    // Build email as RFC 2822 multipart/alternative: a plain-text part (kept
    // byte-identical to the reviewed draft — never touched by the pixel or
    // HTML wrapping) plus the HTML part carrying the tracking pixel.
    const email = [
      ...headers,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlBody,
      "",
      `--${boundary}--`,
    ].join("\n");

    // Gmail's `raw` field requires base64url (RFC 4648 §5), not standard
    // base64 — a `+` or `/` from ordinary base64 makes the API reject the
    // whole message. Buffer's base64url encoding target handles both the
    // alphabet substitution and stripping the `=` padding Gmail doesn't want.
    const base64Email = Buffer.from(email).toString("base64url");

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: base64Email,
        threadId: threadId ?? undefined,
      },
    });

    if (!response.data.id) {
      throw new Error("Gmail API did not return a message ID");
    }

    // The RFC822 Message-ID header (needed to thread a future reply) isn't
    // in the send response — it's only visible on a follow-up read. A
    // metadata-only fetch keeps this cheap (no body download).
    let rfc822MessageId: string | null = null;
    try {
      const sent = await gmail.users.messages.get({
        userId: "me",
        id: response.data.id,
        format: "metadata",
        metadataHeaders: ["Message-Id"],
      });
      rfc822MessageId =
        sent.data.payload?.headers?.find((h) => h.name === "Message-Id")?.value ?? null;
    } catch (err) {
      // Non-fatal — the send already succeeded. Just means a later reply to
      // this message won't get perfect In-Reply-To/References headers.
      console.error("Failed to fetch sent message's Message-Id header:", err);
    }

    return {
      messageId: response.data.id,
      fromAddress,
      threadId: response.data.threadId ?? null,
      rfc822MessageId,
    };
  } catch (error) {
    console.error(`Failed to send email via Gmail (account ${accountIndex}):`, error);
    throw error;
  }
}

/**
 * Get recent messages from an account (for reply detection)
 */
export async function listGmailMessages(
  accountIndex: EmailAccountIndex,
  query: string = "",
  maxResults: number = 50
) {
  try {
    const gmail = getGmailClient(accountIndex);
    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to list Gmail messages (account ${accountIndex}):`, error);
    throw error;
  }
}

/**
 * Get full message details (for extracting headers, body, etc.)
 */
export async function getGmailMessage(
  accountIndex: EmailAccountIndex,
  messageId: string
) {
  try {
    const gmail = getGmailClient(accountIndex);
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to get Gmail message (account ${accountIndex}):`, error);
    throw error;
  }
}

/**
 * Get unread messages from an account (for reply detection in sync job)
 */
export async function getUnreadMessages(accountIndex: EmailAccountIndex) {
  return listGmailMessages(accountIndex, "is:unread", 50);
}

/**
 * Extract email address from Gmail message
 */
export function extractFromAddress(headers: any[]): string {
  const fromHeader = headers?.find((h: any) => h.name === "From");
  if (!fromHeader) return "";
  // Parse "Name <email@domain.com>" or just "email@domain.com"
  const match = fromHeader.value.match(/<([^>]+)>|^([^\s<]+)/);
  return match?.[1] || match?.[2] || "";
}

/**
 * Extract thread ID
 */
export function extractThreadId(message: any): string | null {
  return message?.threadId || null;
}

/** Case-insensitive header lookup — Gmail is inconsistent about "Message-Id" vs "Message-ID" casing. */
export function extractHeader(headers: any[], name: string): string | null {
  const header = headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

type GmailMessagePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailMessagePart[] | null;
};

function collectPartsByType(part: GmailMessagePart | null | undefined, mimeType: string, acc: string[]): void {
  if (!part) return;
  if (part.mimeType === mimeType && part.body?.data) {
    acc.push(Buffer.from(part.body.data, "base64url").toString("utf-8"));
  }
  for (const child of part.parts ?? []) collectPartsByType(child, mimeType, acc);
}

/**
 * Best-effort plain-text body for a reply notification (sync-replies.ts) —
 * walks every part of a possibly-nested multipart message (the old code only
 * ever looked at `payload.parts[0]`, which missed anything but the simplest
 * message shape) rather than assuming a flat single-part layout. Falls back
 * to the HTML part, tags stripped, when there's no text/plain part at all.
 */
export function extractPlainTextBody(message: { payload?: GmailMessagePart | null }): string | null {
  const plain: string[] = [];
  collectPartsByType(message.payload ?? null, "text/plain", plain);
  if (plain.length > 0) return plain.join("\n\n").trim();

  const html: string[] = [];
  collectPartsByType(message.payload ?? null, "text/html", html);
  if (html.length > 0) {
    return html.join("\n\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return null;
}

/** Every text/plain + text/html part concatenated, tags stripped — used only to scan a bounce-notification body for the failed recipient address. */
export function extractAllMessageText(message: { payload?: GmailMessagePart | null }): string {
  const plain: string[] = [];
  collectPartsByType(message.payload ?? null, "text/plain", plain);
  const html: string[] = [];
  collectPartsByType(message.payload ?? null, "text/html", html);
  return [...plain, ...html.map((h) => h.replace(/<[^>]+>/g, " "))].join("\n");
}
