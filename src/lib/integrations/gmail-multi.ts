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
 * Rotate to the next email account (round-robin)
 * On first call, returns 0, then 1, 2, 0, 1, 2, etc.
 */
export function rotateEmailAccount(lastIndex?: EmailAccountIndex | null): EmailAccountIndex {
  if (lastIndex === undefined || lastIndex === null) {
    return 0; // Start with first account
  }
  return ((lastIndex + 1) % 3) as EmailAccountIndex;
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

    // Build email in RFC 2822 format
    const email = [
      `From: ${fromAddress}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\n");

    // Encode to base64
    const base64Email = Buffer.from(email).toString("base64");

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
