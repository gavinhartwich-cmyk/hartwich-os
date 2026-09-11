"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { db } from "@/db";
import { aiWorkforceChatMessages } from "@/db/schema";
import { getAgentDb, isAgentDbConfigured } from "@/db/agent-workforce/client";
import { salesGoals } from "@/db/agent-workforce/schema";
import { listChatMessages } from "@/lib/data/ai-workforce-chat";
import { replyToSalesManager } from "@/lib/ai/sales-manager-chat";

async function requireGavin() {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    throw new Error("Only Gavin can talk to the Sales Manager.");
  }
}

/**
 * Sends one message to the Sales Manager and records both sides of the
 * exchange. Real conversation, not a stub: the reply is grounded in
 * ai-workforce's actual current goals/decisions/pipeline data (see
 * src/lib/ai/sales-manager-chat.ts), and a goal it proposes is stored on
 * the message row for Gavin to confirm explicitly — never created here.
 */
export async function sendChatMessage(userText: string): Promise<void> {
  await requireGavin();
  const text = userText.trim();
  if (!text) return;

  const history = await listChatMessages();

  await db.insert(aiWorkforceChatMessages).values({ role: "user", content: text });

  const result = await replyToSalesManager(text, history);

  await db.insert(aiWorkforceChatMessages).values({
    role: "assistant",
    content: result.reply,
    proposedGoal: result.proposedGoal,
  });

  revalidatePath("/ai-workforce/chat");
}

/**
 * Turns a proposed goal from a specific assistant message into a real
 * sales_goals row in ai-workforce's own database — the same "one
 * deliberate exception" write pattern src/lib/actions/ai-workforce.ts's
 * kill switch already uses. Stamps confirmedAt so the same proposal can't
 * be confirmed twice (the UI also just stops offering the button once
 * that's set, this is the server-side backstop).
 */
export async function confirmGoalProposal(messageId: string): Promise<void> {
  await requireGavin();

  if (!isAgentDbConfigured()) {
    throw new Error("AGENT_DATABASE_URL isn't set — can't create a goal ai-workforce would ever see.");
  }

  const message = await db.query.aiWorkforceChatMessages.findFirst({
    where: eq(aiWorkforceChatMessages.id, messageId),
  });
  if (!message?.proposedGoal) {
    throw new Error("No proposed goal on that message.");
  }
  if (message.confirmedAt) {
    throw new Error("Already confirmed.");
  }

  const { metric, target, periodDays, priority } = message.proposedGoal;
  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);

  const agentDb = getAgentDb();

  // The chat's prompt asks the model to flag an existing goal rather than
  // propose a duplicate, but nothing enforced it — so a second identical
  // new_clients goal was created (2026-09-11 01:59) alongside one from the
  // day before. The Sales Manager runs a cycle per goal, so duplicates make
  // it diagnose the same bottleneck twice and raise two identical
  // escalations, which is exactly what landed in front of Gavin. A prompt is
  // not a constraint; this is.
  const [existing] = await agentDb
    .select({ id: salesGoals.id, target: salesGoals.target, periodEnd: salesGoals.periodEnd })
    .from(salesGoals)
    .where(and(eq(salesGoals.metric, metric), notInArray(salesGoals.status, ["ACHIEVED", "FAILED"])))
    .limit(1);

  if (existing) {
    throw new Error(
      `There's already an active "${metric}" goal (target ${existing.target}, ends ${existing.periodEnd.toISOString().slice(0, 10)}). ` +
        `Two goals on one metric make the Sales Manager work the same problem twice and escalate it twice — adjust that goal instead of adding another.`
    );
  }

  await agentDb.insert(salesGoals).values({
    metric,
    target: target.toString(),
    periodStart,
    periodEnd,
    priority: priority as "low" | "normal" | "high" | "critical",
    status: "NOT_STARTED",
  });

  await db
    .update(aiWorkforceChatMessages)
    .set({ confirmedAt: new Date() })
    .where(eq(aiWorkforceChatMessages.id, messageId));

  revalidatePath("/ai-workforce/chat");
  revalidatePath("/ai-workforce");
}
