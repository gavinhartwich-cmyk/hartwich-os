import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiRateLimits } from "@/db/schema";

/**
 * A lightweight Postgres-backed rate limiter for unauthenticated public
 * routes (/api/public/booking/* today) — one row per (route family, client
 * IP), a fixed window, a count. Reuses the existing database instead of
 * adding a new service (Upstash/Vercel KV): this only needs to block spam
 * on a low-traffic booking page, not serve high QPS.
 */
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export function clientIp(request: Request): string {
  // Vercel sets x-forwarded-for on every request; first entry is the
  // original client. "unknown" (rather than throwing) if it's ever
  // missing — fail toward "shared bucket," not toward blocking real
  // traffic outright.
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Returns true if this call is allowed (and records it), false if `key`
 * has hit `limit` requests within the current window. Fails open (allows
 * the request) on a database error — a rate limiter that itself takes
 * down the booking page on a DB hiccup is a worse outcome than a burst of
 * unthrottled requests.
 */
export async function checkRateLimit(key: string, limit: number): Promise<boolean> {
  try {
    const now = new Date();
    const existing = await db.query.apiRateLimits.findFirst({ where: eq(apiRateLimits.key, key) });

    if (!existing || now.getTime() - existing.windowStart.getTime() > WINDOW_MS) {
      await db
        .insert(apiRateLimits)
        .values({ key, windowStart: now, count: 1 })
        .onConflictDoUpdate({ target: apiRateLimits.key, set: { windowStart: now, count: 1 } });
      return true;
    }

    if (existing.count >= limit) {
      return false;
    }

    await db
      .update(apiRateLimits)
      .set({ count: sql`${apiRateLimits.count} + 1` })
      .where(eq(apiRateLimits.key, key));
    return true;
  } catch (error) {
    console.error("Rate limit check failed, failing open:", error);
    return true;
  }
}
