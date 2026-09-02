import "server-only";
import { google } from "googleapis";

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
 * Send an email via Gmail API from a specific account
 * Returns the message ID if successful
 */
export async function sendEmailViaGmail({
  to,
  subject,
  body,
  accountIndex = 0,
}: {
  to: string;
  subject: string;
  body: string;
  accountIndex?: EmailAccountIndex;
}): Promise<{ messageId: string; fromAddress: string }> {
  try {
    const gmail = getGmailClient(accountIndex);
    const fromAddress = getFromEmailForAccount(accountIndex);

    // Build email in RFC 2822 format. Subject goes through RFC 2047
    // encoded-word encoding when it's not plain ASCII — headers are
    // ASCII-only per spec, and AI-drafted subjects routinely contain
    // smart quotes/em dashes that would otherwise land as raw UTF-8 bytes
    // in the header line and get the whole send rejected.
    const email = [
      `From: ${fromAddress}`,
      `To: ${to}`,
      `Subject: ${encodeHeaderValue(subject)}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
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
      },
    });

    if (!response.data.id) {
      throw new Error("Gmail API did not return a message ID");
    }

    return {
      messageId: response.data.id,
      fromAddress,
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
 * Extract In-Reply-To header (to match with our sent emails)
 */
export function extractInReplyToMessageId(headers: any[]): string | null {
  const replyHeader = headers?.find((h: any) => h.name === "In-Reply-To");
  return replyHeader?.value || null;
}

/**
 * Extract thread ID
 */
export function extractThreadId(message: any): string | null {
  return message?.threadId || null;
}
