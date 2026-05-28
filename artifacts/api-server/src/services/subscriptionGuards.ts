import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

/** Enforce free-tier hatchling storage cap on POST /hatchlings. */
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

/** Generic daily counter gate (used by coach + battle). */
async function consumeDailyCounter(
  playerId: number,
  cap: number,
  field: "dailyCoachUsedCount" | "dailyBattleUsedCount",
  dateField: "dailyCoachResetDate" | "dailyBattleResetDate",
): Promise<{ ok: boolean; used: number; cap: number }> {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) return { ok: false, used: 0, cap };

  const todayStr = today();
  const lastReset = player[dateField];
  const used = lastReset === todayStr ? player[field] : 0;

  if (used >= cap) return { ok: false, used, cap };

  await db.update(playersTable).set({
    [field]: used + 1,
    [dateField]: todayStr,
  } as Partial<typeof playersTable.$inferInsert>).where(eq(playersTable.id, playerId));

  return { ok: true, used: used + 1, cap };
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
