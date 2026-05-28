import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import {
  playersTable,
  adminAllowlistTable,
  adminSessionsTable,
  moderationAuditLogTable,
  type Player,
} from "@workspace/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { logger } from "../lib/logger.ts";

// Cache Clerk primary-email lookups for 60s so the gate doesn't hit Clerk
// on every admin request. The whitelist is the authoritative ground truth;
// short caching just keeps latency reasonable.
const CLERK_EMAIL_CACHE_TTL_MS = 60_000;
const clerkEmailCache = new Map<string, { email: string | null; expiresAt: number }>();

export async function getClerkPrimaryEmail(clerkUserId: string): Promise<string | null> {
  const now = Date.now();
  const cached = clerkEmailCache.get(clerkUserId);
  if (cached && cached.expiresAt > now) return cached.email;
  try {
    const user = await clerkClient.users.getUser(clerkUserId);
    const primaryId = user.primaryEmailAddressId;
    const primary = user.emailAddresses.find((e) => e.id === primaryId);
    const email = primary?.emailAddress ? normalizeEmail(primary.emailAddress) : null;
    clerkEmailCache.set(clerkUserId, { email, expiresAt: now + CLERK_EMAIL_CACHE_TTL_MS });
    return email;
  } catch (err) {
    logger.warn({ err, clerkUserId }, "clerk getUser failed during admin gate");
    return null;
  }
}

export function _resetClerkEmailCacheForTest(): void {
  clerkEmailCache.clear();
}

export const ADMIN_SESSION_COOKIE = "hatchup_admin_session";
export const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;

export type AdminGateReason =
  | "not_signed_in"
  | "not_admin"
  | "not_whitelisted"
  | "session_locked"
  | "session_expired";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminPlayer?: Player;
      adminSessionId?: number;
    }
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function logGateDenial(
  playerId: number | undefined,
  reason: AdminGateReason,
  req: Request,
): Promise<void> {
  if (!playerId) return;
  try {
    await db.insert(moderationAuditLogTable).values({
      actorId: playerId,
      action: "admin_gate_denied",
      reason,
      metadata: JSON.stringify({
        path: req.originalUrl ?? req.url,
        method: req.method,
        ip: req.ip ?? null,
      }),
    });
  } catch (err) {
    logger.warn({ err, reason }, "admin gate denial audit log failed");
  }
}

/**
 * The single gate every `/api/admin/*` route runs through. Verifies in order:
 * 1. Player is authenticated (`req.playerId` set by `attachPlayer`).
 * 2. Player row has `isAdmin=true`.
 * 3. Player's email is on the `admin_allowlist`.
 * 4. A non-expired `hatchup_admin_session` cookie maps to an active session
 *    row for this player.
 *
 * On failure, responds 403 with `{ error: <code> }` so the frontend can
 * branch on the reason and show the right screen. Every denial is recorded
 * to `moderation_audit_log` so attempts to access the panel are auditable.
 */
export const requireAdminPanel: RequestHandler = async (req, res, next) => {
  const playerId = req.playerId;
  if (!playerId) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
  });
  if (!player) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }
  if (!player.isAdmin) {
    await logGateDenial(playerId, "not_admin", req);
    res.status(403).json({ error: "not_admin" });
    return;
  }
  // Whitelist is checked against the Clerk-authenticated primary email, not
  // the (mutable, self-updatable) `players.email` column.
  const email = req.clerkUserId ? await getClerkPrimaryEmail(req.clerkUserId) : null;
  if (!email) {
    await logGateDenial(playerId, "not_whitelisted", req);
    res.status(403).json({ error: "not_whitelisted" });
    return;
  }
  const allow = await db.query.adminAllowlistTable.findFirst({
    where: eq(adminAllowlistTable.email, email),
  });
  if (!allow) {
    await logGateDenial(playerId, "not_whitelisted", req);
    res.status(403).json({ error: "not_whitelisted" });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  const token = cookies?.[ADMIN_SESSION_COOKIE];
  if (!token) {
    res.status(403).json({ error: "session_locked" });
    return;
  }
  const tokenHash = hashToken(token);
  const now = new Date();
  const session = await db.query.adminSessionsTable.findFirst({
    where: and(
      eq(adminSessionsTable.tokenHash, tokenHash),
      eq(adminSessionsTable.playerId, playerId),
      isNull(adminSessionsTable.revokedAt),
      gt(adminSessionsTable.expiresAt, now),
    ),
  });
  if (!session) {
    await logGateDenial(playerId, "session_expired", req);
    res.status(403).json({ error: "session_expired" });
    return;
  }
  // Bump lastSeenAt opportunistically (fire-and-forget).
  db.update(adminSessionsTable)
    .set({ lastSeenAt: now })
    .where(eq(adminSessionsTable.id, session.id))
    .catch(() => {
      /* best effort */
    });

  req.adminPlayer = player;
  req.adminSessionId = session.id;
  next();
};

/** Variant that only requires admin + allowlist (no session). Used for
 * the access-code rotate escape hatch a super-admin can hit even when
 * locked out. */
export const requireSuperAdminBasic: RequestHandler = async (req, res, next) => {
  const playerId = req.playerId;
  if (!playerId) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
  });
  if (!player?.isAdmin || !player.isSuperAdmin) {
    res.status(403).json({ error: "not_super_admin" });
    return;
  }
  const email = req.clerkUserId ? await getClerkPrimaryEmail(req.clerkUserId) : null;
  if (!email) {
    res.status(403).json({ error: "not_whitelisted" });
    return;
  }
  const allow = await db.query.adminAllowlistTable.findFirst({
    where: eq(adminAllowlistTable.email, email),
  });
  if (!allow) {
    res.status(403).json({ error: "not_whitelisted" });
    return;
  }
  req.adminPlayer = player;
  next();
};

/** Guard that further requires `isSuperAdmin`. Runs AFTER requireAdminPanel. */
export const requireSuperAdminPanel: RequestHandler = (req, res, next) => {
  if (!req.adminPlayer?.isSuperAdmin) {
    res.status(403).json({ error: "not_super_admin" });
    return;
  }
  next();
};
