import { db } from "@/db";
import { companies, deals } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Clean up leads: delete all disqualified and needs_review companies.
 * Keep only "qualified" leads (those on the board).
 * Use DELETE method to trigger: fetch("/api/cleanup/leads", { method: "DELETE" })
 */
export async function DELETE() {
  try {
    // Get all companies that are disqualified or needs_review
    const toDelete = await db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.status, ["disqualified", "needs_review"]));

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
      message: `Cleaned up ${deleted.length} companies`,
      deletedCount: deleted.length,
      details: {
        disqualified: deleted.filter((c) => c.status === "disqualified").length,
        needsReview: deleted.filter((c) => c.status === "needs_review").length,
      },
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
      message: `Database has ${qualified} qualified leads. Cleanup will remove ${disqualified + needsReview} other leads.`,
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
