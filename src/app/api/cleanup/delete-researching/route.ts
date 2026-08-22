import { db } from "@/db";
import { pipelineStages } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Delete the "Researching" pipeline stage if it exists.
 * This cleans up old databases that still have it.
 */
export async function DELETE() {
  try {
    const deleted = await db
      .delete(pipelineStages)
      .where(eq(pipelineStages.name, "Researching"))
      .returning();

    return Response.json({
      success: true,
      message: `Deleted ${deleted.length} "Researching" stage(s)`,
      deletedCount: deleted.length,
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
