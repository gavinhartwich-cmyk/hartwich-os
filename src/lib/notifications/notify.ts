import "server-only";
import { sendEmailViaGmail } from "@/lib/integrations/gmail-multi";

const OPS_NOTIFICATION_RECIPIENT = "noahartwich@gmail.com";

/**
 * Sends an internal ops email to noahartwich@gmail.com whenever the v1.1
 * email automation does something on its own: a reply comes in and gets an
 * AI-drafted response, a bounce is detected and a re-search for a working
 * address runs, or a deal gets auto-flagged/moved by the follow-up cadence.
 * Not for anything a human already clicked "send" on — this is specifically
 * "here's something automated that happened, go take a look."
 *
 * Sent from account 0 directly (bypasses pickAvailableAccount/warm-up — an
 * internal notification isn't cold outreach and shouldn't compete with it
 * for daily send-cap headroom). Best-effort and non-throwing, same spirit as
 * notifySlack (src/lib/integrations/slack.ts): a notification failure must
 * never take down the automation that triggered it.
 */
export async function notifyOps(subject: string, body: string): Promise<void> {
  try {
    await sendEmailViaGmail({
      to: OPS_NOTIFICATION_RECIPIENT,
      subject: `[Hartwich OS] ${subject}`,
      body,
      accountIndex: 0,
    });
  } catch (err) {
    console.error("Ops notification failed:", err);
  }
}
