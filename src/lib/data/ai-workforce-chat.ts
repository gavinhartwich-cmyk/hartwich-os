import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { aiWorkforceChatMessages } from "@/db/schema";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposedGoal: { metric: string; target: number; periodDays: number; priority: string; rationale: string } | null;
  confirmedAt: Date | null;
  createdAt: Date;
};

/** The whole conversation, oldest first — one global thread (Gavin-only feature, see schema.ts's header comment). */
export async function listChatMessages(): Promise<ChatMessage[]> {
  const rows = await db.query.aiWorkforceChatMessages.findMany({
    orderBy: asc(aiWorkforceChatMessages.createdAt),
  });
  return rows;
}
