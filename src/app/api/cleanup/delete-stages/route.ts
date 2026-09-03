import { db } from "@/db";
import { pipelineStages, deals } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Removes the "Researching" and "Qualified" board columns — supersedes the
 * old delete-researching/route.ts (same stage, generalized to a name
 * list). Refuses to delete a stage that still has deals sitting in it (the
 * deals.stageId FK has no cascade) rather than silently reassigning or
 * losing them — move those deals to another column on the board first,
 * then re-run this.
 * Use DELETE method to trigger: fetch("/api/cleanup/delete-stages", { method: "DELETE" })
 */
const STAGE_NAMES_TO_REMOVE = ["Researching", "Qualified"];

export async function DELETE() {
  try {
    const stages = await db
      .select()
      .from(pipelineStages)
      .where(inArray(pipelineStages.name, STAGE_NAMES_TO_REMOVE));

    const results: { name: string; deleted: boolean; dealsBlocking?: number }[] = [];

    for (const stage of stages) {
      const dealsInStage = await db
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.stageId, stage.id));

      if (dealsInStage.length > 0) {
        results.push({ name: stage.name, deleted: false, dealsBlocking: dealsInStage.length });
        continue;
      }

      await db.delete(pipelineStages).where(eq(pipelineStages.id, stage.id));
      results.push({ name: stage.name, deleted: true });
    }

    const skipped = results.filter((r) => !r.deleted);

    return Response.json({
      success: true,
      results,
      message:
        stages.length === 0
          ? "No 'Researching' or 'Qualified' stage found — nothing to remove."
          : skipped.length > 0
            ? `Some stages still have deals in them — move those cards to another column first: ${skipped
                .map((r) => `${r.name} (${r.dealsBlocking})`)
                .join(", ")}`
            : `Removed ${results.length} stage(s).`,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
