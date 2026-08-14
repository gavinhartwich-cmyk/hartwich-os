import "server-only";
import { db } from "@/db";

/** Which discovery/enrichment sources are active and how they're configured (architecture doc §3, §5). */
export async function getActiveLeadSourceConfig(type: "google_places" | "apollo" | "manual") {
  return db.query.leadSourcesConfig.findFirst({
    where: (c, { eq, and }) => and(eq(c.type, type), eq(c.isActive, true)),
  });
}
