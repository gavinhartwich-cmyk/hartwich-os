import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveryRuns } from "@/db/schema";

export async function createDiscoveryRun(input: {
  area: string;
  keyword: string;
  targetCount: number;
  requestedByUserId?: string;
}) {
  const [run] = await db
    .insert(discoveryRuns)
    .values({
      area: input.area,
      keyword: input.keyword,
      targetCount: input.targetCount,
      requestedByUserId: input.requestedByUserId,
    })
    .returning();
  return run;
}

export async function updateDiscoveryRunProgress(
  id: string,
  input: { foundCount?: number; radiusMiles?: number }
) {
  await db.update(discoveryRuns).set(input).where(eq(discoveryRuns.id, id));
}

export async function completeDiscoveryRun(
  id: string,
  status: "completed" | "completed_partial" | "failed",
  input: { foundCount: number; radiusMiles?: number }
) {
  await db
    .update(discoveryRuns)
    .set({ ...input, status, completedAt: new Date() })
    .where(eq(discoveryRuns.id, id));
}

export async function getDiscoveryRun(id: string) {
  return db.query.discoveryRuns.findFirst({ where: (r, { eq }) => eq(r.id, id) });
}
