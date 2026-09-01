import { db } from "@/db";
import { companies, deals } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Clean up leads: delete disqualified companies only. "needs_review" is
 * left alone on purpose — those are manually-added leads (or legacy
 * AI-sourced ones) still waiting on a human look, not junk.
 * Use DELETE method to trigger: fetch("/api/cleanup/leads", { method: "DELETE" })
 */
export async function DELETE() {
  try {
    // Get all disqualified companies
    const toDelete = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.status, "disqualified"));

    const idsToDelete = toDelete.map((c) => c.id);

    if (idsToDelete.length === 0) {
      return Response.json({
        success: true,
        message: "No cleanup needed — database is clean",
        deletedCount: 0,
      });
    }

    // Delete all deals for these companies first (cascade will handle this, but be explicit)
    await db.delete(deals).where(inArray(deals.companyId, idsToDelete));

    // Delete the companies
    const deleted = await db
      .delete(companies)
      .where(inArray(companies.id, idsToDelete))
      .returning();

    return Response.json({
      success: true,
      message: `Cleaned up ${deleted.length} disqualified companies`,
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

/**
 * GET: Show cleanup stats (preview what will be deleted)
 */
export async function GET() {
  try {
    const stats = await db
      .select({
        status: companies.status,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(companies)
      .groupBy(companies.status);

    const disqualified = stats.find((s) => s.status === "disqualified")?.count || 0;
    const needsReview = stats.find((s) => s.status === "needs_review")?.count || 0;
    const qualified = stats.find((s) => s.status === "qualified")?.count || 0;

    return Response.json({
      success: true,
      stats: {
        qualified,
        disqualified,
        needsReview,
        total: qualified + disqualified + needsReview,
      },
      message: `Database has ${qualified} qualified leads. Cleanup will remove ${disqualified} disqualified leads (${needsReview} needing review are kept).`,
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
