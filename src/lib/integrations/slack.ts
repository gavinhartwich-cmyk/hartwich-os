import "server-only";

/**
 * Optional lead-mining run summary (architecture doc §5, "Persist &
 * notify"). No-ops when SLACK_WEBHOOK_URL isn't configured — this
 * integration is opt-in, not a dependency of the discovery workflow.
 */
export async function notifySlack(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("Slack notification failed:", err);
  }
}
