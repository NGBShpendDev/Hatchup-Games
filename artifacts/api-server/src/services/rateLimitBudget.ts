import { db, rateLimitAttemptsTable } from "@workspace/db";
import { and, desc, eq, lt } from "drizzle-orm";

/**
 * Generic per-actor rate-limit gate backed by the `rate_limit_attempts`
 * Postgres table. Each successful call records one row at `(scope, key)`
 * with `createdAt = now()`. Subsequent calls count rows in the current
 * window — if the count is below `max`, the call is allowed and a new row
 * is inserted; otherwise the call is denied.
 *
 * This is the durable replacement for express-rate-limit's in-process
 * memory store. The express store resets on every redeploy and is not
 * shared across instances — a determined client could bypass the cap by
 * waiting for a restart. Using Postgres closes that loophole and makes
 * the limits behave consistently when the API is horizontally scaled.
 *
 * `scope` namespaces independent limiters so they don't collide
 * (e.g. `"ai_coach"`, `"recap_preview"`, `"email_resend"`). `key` is the
 * per-actor bucket — usually `"player:<id>"`, falling back to `"ip:<addr>"`
 * for unauthenticated edge cases the middleware still has to route past.
 *
 * GC is bounded per `(scope, key)` — at most `max` rows live in any window
 * for a given key, and the opportunistic delete touches only that key's
 * rows, so the table never accumulates more than `max * activeKeys` rows.
 */
export async function consumeRateLimitBudget(
  scope: string,
  key: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs);
  // Opportunistic GC scoped to this key only — keeps the per-call delete
  // bounded regardless of how many other keys are active in the table.
  await db
    .delete(rateLimitAttemptsTable)
    .where(
      and(
        eq(rateLimitAttemptsTable.scope, scope),
        eq(rateLimitAttemptsTable.key, key),
        lt(rateLimitAttemptsTable.createdAt, cutoff),
      ),
    );
  const recent = await db
    .select({ id: rateLimitAttemptsTable.id })
    .from(rateLimitAttemptsTable)
    .where(
      and(
        eq(rateLimitAttemptsTable.scope, scope),
        eq(rateLimitAttemptsTable.key, key),
      ),
    )
    .orderBy(desc(rateLimitAttemptsTable.createdAt));
  if (recent.length >= max) return false;
  await db.insert(rateLimitAttemptsTable).values({ scope, key });
  return true;
}
