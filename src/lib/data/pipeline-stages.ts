import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pipelineStages } from "@/db/schema";

export type PipelineStage = Awaited<ReturnType<typeof listPipelineStages>>[number];

export async function listPipelineStages() {
  return db.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
}

/**
 * Canonical stage names (see src/db/seed.ts's DEFAULT_STAGES) that code —
 * not just the UI — needs to branch on: the v1.1 email cadence moves deals
 * into "Contacted" on send and "Engaged" on reply. Both are renameable from
 * the board UI (stages are data, not code, per the architecture doc), so
 * findStageByName looks these up by exact name at call time rather than
 * hardcoding an id; if a stage gets renamed, these automations stop firing
 * until it's re-seeded or the constant below is updated to match.
 */
export const PIPELINE_STAGE_NAMES = {
  NEW_LEAD: "New Lead",
  CONTACTED: "Contacted",
  ENGAGED: "Engaged",
} as const;

export async function findStageByName(name: string) {
  return db.query.pipelineStages.findFirst({
    where: eq(pipelineStages.name, name),
  });
}
