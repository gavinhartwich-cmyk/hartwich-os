import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { pipelineStages } from "@/db/schema";

export type PipelineStage = Awaited<ReturnType<typeof listPipelineStages>>[number];

export async function listPipelineStages() {
  return db.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
}
