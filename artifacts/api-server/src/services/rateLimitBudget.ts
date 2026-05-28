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
 *
 * Returns `{ allowed }` plus, when the call is denied, `retryAfterSeconds`
 * — the wall-clock seconds until the oldest in-window attempt rolls off
 * and a slot frees up. Callers (the `dbLimiter` middleware) surface this
 * to clients via the standard `Retry-After` header and an additive
 * `retryAfterSeconds` field on the 429 JSON body so frontends can render
 * a precise "Try again in 42s" countdown instead of a generic message.
 */
export interface RateLimitBudgetResult {
  allowed: boolean;
  /**
   * Seconds (rounded up, minimum 1) until the next slot frees for this
   * `(scope, key)` bucket. Only set when `allowed === false`. Omitted if
   * we cannot determine it (e.g. the row's `createdAt` is missing in a
   * test stub) so callers can fall back to a generic message.
   */
  retryAfterSeconds?: number;
}

export async function consumeRateLimitBudget(
  scope: string,
  key: string,
  windowMs: number,
  max: number,
): Promise<RateLimitBudgetResult> {
  const now = Date.now();
  const cutoff = new Date(now - windowMs);
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
    .select({
      id: rateLimitAttemptsTable.id,
      createdAt: rateLimitAttemptsTable.createdAt,
    })
    .from(rateLimitAttemptsTable)
    .where(
      and(
        eq(rateLimitAttemptsTable.scope, scope),
        eq(rateLimitAttemptsTable.key, key),
      ),
    )
    .orderBy(desc(rateLimitAttemptsTable.createdAt));
  if (recent.length >= max) {
    // `recent` is desc, so the `max`-th newest row (index max-1) is the
    // oldest attempt that still occupies a slot. The next slot frees when
    // that row rolls off the window: createdAt + windowMs.
    const blocker = recent[max - 1];
    const blockerTs = blocker?.createdAt instanceof Date
      ? blocker.createdAt.getTime()
      : typeof blocker?.createdAt === "string"
        ? Date.parse(blocker.createdAt)
        : NaN;
    if (Number.isFinite(blockerTs)) {
      const msUntilFree = Math.max(0, blockerTs + windowMs - now);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msUntilFree / 1000)) };
    }
    return { allowed: false };
  }
  await db.insert(rateLimitAttemptsTable).values({ scope, key });
  return { allowed: true };
}
