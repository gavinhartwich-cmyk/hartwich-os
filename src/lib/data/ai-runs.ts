import "server-only";
import { db } from "@/db";
import { aiRuns } from "@/db/schema";

/** Audit + cost log for every AI call (architecture doc §3, §5). */
export async function logAiRun(input: {
  targetType: "company_qualification" | "outreach_draft" | "enrichment";
  targetId?: string | null;
  model: string;
  prompt?: string | null;
  tokensUsed?: number | null;
  costEstimateUsd?: string | null;
  result?: Record<string, unknown> | null;
  status: "pending" | "succeeded" | "failed";
}) {
  const [row] = await db
    .insert(aiRuns)
    .values({
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      model: input.model,
      prompt: input.prompt ?? null,
      tokensUsed: input.tokensUsed ?? null,
      costEstimateUsd: input.costEstimateUsd ?? null,
      result: input.result ?? null,
      status: input.status,
    })
    .returning();
  return row;
}
