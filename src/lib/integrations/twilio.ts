import "server-only";
import Twilio from "twilio";

/**
 * SMS reminders (Phase 6). No-ops when TWILIO_* isn't configured — same
 * "optional, fails closed" shape as slack.ts and google-calendar.ts.
 * Booking still works without this; only the SMS leg of reminders is
 * skipped.
 */
function isConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
}

export function isTwilioConfigured(): boolean {
  return isConfigured();
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isConfigured()) return false;

  try {
    const client = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body,
    });
    return true;
  } catch (error) {
    console.error("Failed to send SMS reminder:", error);
    return false;
  }
}
