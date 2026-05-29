import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";
import { getEntitlement } from "./entitlement.ts";
import { refreshTop10Status } from "./top10.ts";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve the live entitlement for the current player, with a 24h-cached
 * Top-10 refresh. Stored as req.entitlement for downstream gating.
 */
export async function attachEntitlement(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.playerId) { next(); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId) });
  if (!player) { next(); return; }

  // Refresh Top-10 if stale (>24h) AND trial/paid aren't currently active.
  const trialActive = player.trialEndsAt && new Date(player.trialEndsAt).getTime() > Date.now();
  const paidActive  = player.paidUntil   && new Date(player.paidUntil).getTime()   > Date.now();
  const lastCheck   = player.top10LastCheckedAt?.getTime() ?? 0;
  const stale       = (Date.now() - lastCheck) > 24 * 60 * 60 * 1000;

  if (!trialActive && !paidActive && stale) {
    await refreshTop10Status(req.playerId);
    const refreshed = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId) });
    if (refreshed) req.entitlement = getEntitlement(refreshed);
  } else {
    req.entitlement = getEntitlement(player);
  }
  next();
}

/** Reject if player's tier is "free". */
export function requirePremium(req: Request, res: Response, next: NextFunction): void {
  if (req.entitlement?.tier !== "premium") {
    res.status(402).json({ error: "premium_required", message: "This feature is available to HatchUp Premium subscribers." });
    return;
  }
  next();
}

/**
 * Non-atomic hatchling storage cap middleware. Retained as a fast-fail
 * pre-check and for unit-test coverage. The authoritative, race-safe
 * enforcement is `atomicInsertWithHatchlingCap` used inside the route handler.
 */
export async function enforceHatchlingCap(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.playerId || !req.entitlement) { next(); return; }
  if (req.entitlement.tier === "premium") { next(); return; }
  const existing = await db.query.hatchlingsTable.findMany({
    where: eq(hatchlingsTable.playerId, req.playerId),
  });
  if (existing.length >= req.entitlement.features.hatchlingStorageCap) {
    res.status(402).json({
      error: "hatchling_cap_reached",
      message: `Free accounts can hold up to ${req.entitlement.features.hatchlingStorageCap} Hatchlings. Upgrade to Premium for unlimited storage.`,
      cap: req.entitlement.features.hatchlingStorageCap,
    });
    return;
  }
  next();
}

/**
 * Atomically check the free-tier hatchling storage cap and insert the new row
 * inside a single serializable transaction. Acquires a row lock on the player
 * record so concurrent hatch requests cannot all observe the same pre-insert
 * count and slip past the cap together.
 *
 * Returns the inserted hatchling row on success, or a 402 error payload when
 * the cap is reached. Callers (the POST /hatchlings handler) should skip the
 * separate db.insert() and use this function instead when the player is on the
 * free tier.
 */
export async function atomicInsertWithHatchlingCap<T>(
  playerId: number,
  cap: number,
  insertFn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<{ ok: true; result: T } | { ok: false; cap: number }> {
  return await db.transaction(async (tx) => {
    // Lock the player row for the duration of this transaction so concurrent
    // requests cannot simultaneously pass the cap check.
    await tx.select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .for("update");

    const [row] = await tx
      .select({ total: count() })
      .from(hatchlingsTable)
      .where(eq(hatchlingsTable.playerId, playerId));

    const existing = row?.total ?? 0;
    if (existing >= cap) {
      return { ok: false as const, cap };
    }

    const result = await insertFn(tx);
    return { ok: true as const, result };
  });
}

/**
 * Atomically consume one unit of a daily quota counter.
 *
 * A transaction with a row-level lock (SELECT … FOR UPDATE) on the player row
 * ensures that concurrent requests read the same pre-increment count only
 * once: the second request will block until the first transaction commits,
 * then re-read the already-incremented value and correctly reject (or
 * succeed) based on the updated count.
 */
async function consumeDailyCounter(
  playerId: number,
  cap: number,
  field: "dailyCoachUsedCount" | "dailyBattleUsedCount",
  dateField: "dailyCoachResetDate" | "dailyBattleResetDate",
): Promise<{ ok: boolean; used: number; cap: number }> {
  return await db.transaction(async (tx) => {
    // Lock the player row so concurrent calls queue up here rather than all
    // reading the same pre-increment counter value.
    const rows = await tx.select().from(playersTable)
      .where(eq(playersTable.id, playerId))
      .for("update");
    const player = rows[0];
    if (!player) return { ok: false, used: 0, cap };

    const todayStr = today();
    const lastReset = player[dateField];
    const used = lastReset === todayStr ? player[field] : 0;

    if (used >= cap) return { ok: false, used, cap };

    await tx.update(playersTable).set({
      [field]: used + 1,
      [dateField]: todayStr,
    } as Partial<typeof playersTable.$inferInsert>).where(eq(playersTable.id, playerId));

    return { ok: true, used: used + 1, cap };
  });
}

export async function enforceCoachDailyCap(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.playerId || !req.entitlement) { next(); return; }
  if (req.entitlement.tier === "premium") { next(); return; }
  const cap = req.entitlement.features.dailyCoachPromptCap;
  const result = await consumeDailyCounter(req.playerId, cap, "dailyCoachUsedCount", "dailyCoachResetDate");
  if (!result.ok) {
    res.status(402).json({
      error: "coach_daily_cap_reached",
      message: `Free accounts get ${cap} AI coach messages per day. Upgrade to Premium for unlimited coaching.`,
      cap,
    });
    return;
  }
  next();
}

export async function enforceBattleDailyCap(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.playerId || !req.entitlement) { next(); return; }
  if (req.entitlement.tier === "premium") { next(); return; }
  const cap = req.entitlement.features.dailyBattleEntryCap;
  const result = await consumeDailyCounter(req.playerId, cap, "dailyBattleUsedCount", "dailyBattleResetDate");
  if (!result.ok) {
    res.status(402).json({
      error: "battle_daily_cap_reached",
      message: `Free accounts get ${cap} battle entries per day. Upgrade to Premium for unlimited matches.`,
      cap,
    });
    return;
  }
  next();
}

/**
 * Programmatic battle-cap check for non-Express entry points (e.g. WebSocket
 * `join_queue`). Resolves entitlement directly from the player row and
 * consumes the daily counter. Returns {ok:true} on success; otherwise an
 * error code + message suitable for echoing to the caller.
 */
export async function checkAndConsumeBattleCap(playerId: number): Promise<
  { ok: true } | { ok: false; error: string; message: string; cap: number }
> {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) return { ok: true };
  const ent = getEntitlement(player);
  if (ent.tier === "premium") return { ok: true };
  const cap = ent.features.dailyBattleEntryCap;
  const result = await consumeDailyCounter(playerId, cap, "dailyBattleUsedCount", "dailyBattleResetDate");
  if (!result.ok) {
    return {
      ok: false,
      error: "battle_daily_cap_reached",
      message: `Free accounts get ${cap} battle entries per day. Upgrade to Premium for unlimited matches.`,
      cap,
    };
  }
  return { ok: true };
}

declare global {
  namespace Express {
    interface Request {
      entitlement?: import("./entitlement").Entitlement;
    }
  }
}
