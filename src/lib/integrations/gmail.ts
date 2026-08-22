import "server-only";
import { google } from "googleapis";

/**
 * Gmail API integration for sending outreach emails.
 * 
 * Uses stored OAuth tokens (manual refresh) for now.
 * Future: implement full OAuth2 flow in the app.
 */

let gmailService: ReturnType<typeof google.gmail> | null = null;

// Initialize Gmail API client with stored credentials
function getGmailClient() {
  if (gmailService) return gmailService;

  const accessToken = process.env.GMAIL_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("GMAIL_ACCESS_TOKEN not set in environment variables");
  }

  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || "",
    process.env.GMAIL_CLIENT_SECRET || ""
  );

  auth.setCredentials({
    access_token: accessToken,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  gmailService = google.gmail({ version: "v1", auth });
  return gmailService;
}

/**
 * Send an email via Gmail API
 * Returns the message ID if successful
 */
export async function sendEmailViaGmail({
  to,
  subject,
  body,
  fromAddress,
}: {
  to: string;
  subject: string;
  body: string;
  fromAddress?: string;
}): Promise<string> {
  try {
    const gmail = getGmailClient();

    // Build email in RFC 2822 format
    const email = [
      `From: ${fromAddress || process.env.GMAIL_FROM_ADDRESS || "noreply@hartwich.ai"}`,
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

    return response.data.id;
  } catch (error) {
    console.error("Failed to send email via Gmail:", error);
    throw error;
  }
}

/**
 * Get Gmail message details (for reply detection later)
 */
export async function getGmailMessage(messageId: string) {
  try {
    const gmail = getGmailClient();
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
    });
    return response.data;
  } catch (error) {
    console.error("Failed to get Gmail message:", error);
    throw error;
  }
}

/**
 * List emails from a user (for reply detection)
 */
export async function listGmailMessages(query: string = "", maxResults: number = 10) {
  try {
    const gmail = getGmailClient();
    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    });
    return response.data;
  } catch (error) {
    console.error("Failed to list Gmail messages:", error);
    throw error;
  }
}
