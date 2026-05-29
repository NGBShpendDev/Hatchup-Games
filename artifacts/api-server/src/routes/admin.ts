import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  playersTable,
  adminAllowlistTable,
  adminAccessCodesTable,
  adminSessionsTable,
  moderationAuditLogTable,
  userReportsTable,
  accountAppealsTable,
} from "@workspace/db/schema";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  constantTimeEqualHex,
  hashToken,
  normalizeEmail,
  requireAdminPanel,
  requireSuperAdminPanel,
  getClerkPrimaryEmail,
} from "../middlewares/adminPanel.ts";
import { adminUnlockLimiter } from "../middlewares/rateLimiters.ts";
import { logger } from "../lib/logger.ts";

const router = Router();

async function audit(
  actorId: number,
  action: string,
  metadata: Record<string, unknown> | null,
  targetPlayerId: number | null = null,
): Promise<void> {
  try {
    await db.insert(moderationAuditLogTable).values({
      actorId,
      action,
      targetPlayerId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    logger.warn({ err, action }, "admin audit log insert failed");
  }
}

function setSessionCookie(res: import("express").Response, token: string, expiresAt: Date): void {
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

function clearSessionCookie(res: import("express").Response): void {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
}

// ── Session: status / unlock / lock ──────────────────────────────────────────

// GET /api/admin/session — returns whether the cookie is currently valid.
// Does NOT require the gate (deliberately) so the frontend can poll status
// without first being inside the panel.
router.get("/admin/session", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
  });
  const isAdmin = !!player?.isAdmin;
  const isSuperAdmin = !!player?.isSuperAdmin;
  const email = req.clerkUserId ? await getClerkPrimaryEmail(req.clerkUserId) : null;
  const allow = email
    ? await db.query.adminAllowlistTable.findFirst({ where: eq(adminAllowlistTable.email, email) })
    : null;
  const whitelisted = !!allow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  const token = cookies?.[ADMIN_SESSION_COOKIE];
  let unlocked = false;
  let expiresAt: string | null = null;
  let remainingMs = 0;
  if (token && isAdmin && whitelisted) {
    const session = await db.query.adminSessionsTable.findFirst({
      where: and(
        eq(adminSessionsTable.tokenHash, hashToken(token)),
        eq(adminSessionsTable.playerId, playerId),
        isNull(adminSessionsTable.revokedAt),
        gt(adminSessionsTable.expiresAt, new Date()),
      ),
    });
    if (session) {
      unlocked = true;
      expiresAt = session.expiresAt.toISOString();
      remainingMs = Math.max(0, session.expiresAt.getTime() - Date.now());
    }
  }
  const codeExists = !!(await db.query.adminAccessCodesTable.findFirst({
    orderBy: [desc(adminAccessCodesTable.rotatedAt)],
  }));
  res.json({
    isAdmin,
    isSuperAdmin,
    whitelisted,
    unlocked,
    expiresAt,
    remainingMs,
    accessCodeConfigured: codeExists,
    ttlMs: ADMIN_SESSION_TTL_MS,
  });
});

router.post(
  "/admin/session/unlock",
  requireAuth,
  attachPlayer,
  adminUnlockLimiter,
  async (req, res) => {
    const playerId = req.playerId!;
    const body = req.body as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      res.status(400).json({ error: "missing_code" });
      return;
    }
    const player = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, playerId),
    });
    if (!player?.isAdmin) {
      res.status(403).json({ error: "not_admin" });
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
    const active = await db.query.adminAccessCodesTable.findFirst({
      orderBy: [desc(adminAccessCodesTable.rotatedAt)],
    });
    if (!active) {
      res.status(503).json({ error: "no_code_configured" });
      return;
    }
    const submittedHash = hashToken(code);
    if (!constantTimeEqualHex(submittedHash, active.codeHash)) {
      await audit(playerId, "admin_unlock_failed", { ip: req.ip ?? null });
      res.status(401).json({ error: "invalid_code" });
      return;
    }
    // Issue session.
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
    await db.insert(adminSessionsTable).values({
      playerId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    setSessionCookie(res, token, expiresAt);
    await audit(playerId, "admin_unlock", { ip: req.ip ?? null });
    res.json({ unlocked: true, expiresAt: expiresAt.toISOString(), remainingMs: ADMIN_SESSION_TTL_MS });
  },
);

router.post("/admin/session/lock", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  const token = cookies?.[ADMIN_SESSION_COOKIE];
  if (token) {
    await db
      .update(adminSessionsTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(adminSessionsTable.tokenHash, hashToken(token)),
          eq(adminSessionsTable.playerId, playerId),
        ),
      );
  }
  clearSessionCookie(res);
  await audit(playerId, "admin_lock", null);
  res.json({ locked: true });
});

// ── Hub counts ───────────────────────────────────────────────────────────────

router.get("/admin/hub/counts", requireAuth, attachPlayer, requireAdminPanel, async (_req, res) => {
  const [openReports, pendingAppeals, suspended] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(userReportsTable).where(eq(userReportsTable.status, "open")),
    db.select({ c: sql<number>`count(*)::int` }).from(accountAppealsTable).where(eq(accountAppealsTable.status, "pending")),
    db.select({ c: sql<number>`count(*)::int` }).from(playersTable).where(eq(playersTable.isSuspended, true)),
  ]);
  res.json({
    openReports: openReports[0]?.c ?? 0,
    pendingAppeals: pendingAppeals[0]?.c ?? 0,
    suspendedUsers: suspended[0]?.c ?? 0,
  });
});

// ── Session activity (super-admin only) ──────────────────────────────────────
// Powers the "Recent unlocks" panel in /admin/settings so super-admins can
// audit who unlocked the panel and from where.
router.get(
  "/admin/sessions/recent",
  requireAuth,
  attachPlayer,
  requireAdminPanel,
  requireSuperAdminPanel,
  async (_req, res) => {
    const rows = await db
      .select({
        id: adminSessionsTable.id,
        playerId: adminSessionsTable.playerId,
        unlockedAt: adminSessionsTable.unlockedAt,
        expiresAt: adminSessionsTable.expiresAt,
        lastSeenAt: adminSessionsTable.lastSeenAt,
        revokedAt: adminSessionsTable.revokedAt,
        ip: adminSessionsTable.ip,
        userAgent: adminSessionsTable.userAgent,
        username: playersTable.username,
        displayName: playersTable.displayName,
      })
      .from(adminSessionsTable)
      .leftJoin(playersTable, eq(playersTable.id, adminSessionsTable.playerId))
      .orderBy(desc(adminSessionsTable.unlockedAt))
      .limit(50);
    const now = Date.now();
    res.json(
      rows.map((r) => ({
        id: r.id,
        playerId: r.playerId,
        username: r.username,
        displayName: r.displayName,
        ip: r.ip,
        userAgent: r.userAgent,
        unlockedAt: r.unlockedAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
        active: !r.revokedAt && r.expiresAt.getTime() > now,
      })),
    );
  },
);

// ── Allowlist (super-admin only) ─────────────────────────────────────────────

router.get(
  "/admin/allowlist",
  requireAuth,
  attachPlayer,
  requireAdminPanel,
  requireSuperAdminPanel,
  async (_req, res) => {
    const rows = await db
      .select()
      .from(adminAllowlistTable)
      .orderBy(adminAllowlistTable.email);
    res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  },
);

router.post(
  "/admin/allowlist",
  requireAuth,
  attachPlayer,
  requireAdminPanel,
  requireSuperAdminPanel,
  async (req, res) => {
    const body = req.body as { email?: unknown };
    const raw = typeof body.email === "string" ? body.email : "";
    const email = normalizeEmail(raw);
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }
    const [row] = await db
      .insert(adminAllowlistTable)
      .values({ email, addedByAdminId: req.playerId! })
      .onConflictDoNothing()
      .returning();
    await audit(req.playerId!, "admin_allowlist_add", { email });
    res.status(201).json(row ?? { email, alreadyPresent: true });
  },
);

router.delete(
  "/admin/allowlist/:id",
  requireAuth,
  attachPlayer,
  requireAdminPanel,
  requireSuperAdminPanel,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const [removed] = await db
      .delete(adminAllowlistTable)
      .where(eq(adminAllowlistTable.id, id))
      .returning();
    if (!removed) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await audit(req.playerId!, "admin_allowlist_remove", { email: removed.email });
    res.json({ removed: true });
  },
);

// ── Access-code rotate ───────────────────────────────────────────────────────
// Requires a fully unlocked admin session (requireAdminPanel) AND
// isSuperAdmin (requireSuperAdminPanel). Rotation must not be reachable
// without first passing the two-step admin boundary — otherwise a
// compromised Clerk session alone would be enough to mint a new code and
// immediately unlock the panel, defeating the second factor entirely.

router.post(
  "/admin/access-code/rotate",
  requireAuth,
  attachPlayer,
  requireAdminPanel,
  requireSuperAdminPanel,
  async (req, res) => {
    const code = randomBytes(8).toString("base64url").slice(0, 12).toUpperCase();
    await db.insert(adminAccessCodesTable).values({
      codeHash: hashToken(code),
      rotatedByAdminId: req.playerId!,
    });
    await audit(req.playerId!, "admin_code_rotated", null);
    res.json({ code, message: "Save this code — it will not be shown again." });
  },
);

// ── Admins management (super-admin only) ─────────────────────────────────────

router.get(
  "/admin/players",
  requireAuth,
  attachPlayer,
  requireAdminPanel,
  requireSuperAdminPanel,
  async (_req, res) => {
    const rows = await db
      .select({
        id: playersTable.id,
        username: playersTable.username,
        displayName: playersTable.displayName,
        email: playersTable.email,
        isAdmin: playersTable.isAdmin,
        isSuperAdmin: playersTable.isSuperAdmin,
      })
      .from(playersTable)
      .where(eq(playersTable.isAdmin, true))
      .orderBy(playersTable.username);
    res.json(rows);
  },
);

router.post(
  "/admin/players",
  requireAuth,
  attachPlayer,
  requireAdminPanel,
  requireSuperAdminPanel,
  async (req, res) => {
    const body = req.body as { playerId?: unknown; isAdmin?: unknown; isSuperAdmin?: unknown };
    const targetId = Number(body.playerId);
    if (!Number.isFinite(targetId)) {
      res.status(400).json({ error: "invalid_player" });
      return;
    }
    const target = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, targetId),
    });
    if (!target) {
      res.status(404).json({ error: "player_not_found" });
      return;
    }
    const updates: Partial<{ isAdmin: boolean; isSuperAdmin: boolean }> = {};
    if (typeof body.isAdmin === "boolean") updates.isAdmin = body.isAdmin;
    if (typeof body.isSuperAdmin === "boolean") updates.isSuperAdmin = body.isSuperAdmin;
    if (updates.isSuperAdmin && updates.isAdmin === false) {
      res.status(400).json({ error: "cannot_be_super_without_admin" });
      return;
    }
    if (updates.isAdmin === false) updates.isSuperAdmin = false;
    // Prevent the last super-admin from demoting themselves into a lockout.
    if (
      updates.isSuperAdmin === false &&
      target.isSuperAdmin &&
      target.id === req.playerId
    ) {
      const others = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(playersTable)
        .where(and(eq(playersTable.isSuperAdmin, true), ne(playersTable.id, target.id)));
      if ((others[0]?.c ?? 0) === 0) {
        res.status(400).json({ error: "last_super_admin" });
        return;
      }
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "no_changes" });
      return;
    }
    const [updated] = await db
      .update(playersTable)
      .set(updates)
      .where(eq(playersTable.id, targetId))
      .returning({
        id: playersTable.id,
        username: playersTable.username,
        email: playersTable.email,
        isAdmin: playersTable.isAdmin,
        isSuperAdmin: playersTable.isSuperAdmin,
      });
    await audit(req.playerId!, "admin_role_change", { target: targetId, ...updates }, targetId);
    res.json(updated);
  },
);

// ── Bootstrap helper exported for app boot ───────────────────────────────────

/**
 * One-shot bootstrap that runs on server start.
 * Seeds an initial access code if none exists.
 *
 * The plaintext is NOT logged. Retrieve the hash from the
 * admin_access_codes table and rotate via /admin/settings.
 *
 * Intentionally does NOT backfill the allowlist from isAdmin rows (the
 * allowlist is an independent, durable control that must not be silently
 * re-granted on every restart) and does NOT auto-promote admins to
 * super-admin (privilege escalation must be an explicit operator action).
 */
export async function bootstrapAdminPanel(): Promise<void> {
  try {
    const code = await db.query.adminAccessCodesTable.findFirst({
      orderBy: [desc(adminAccessCodesTable.rotatedAt)],
    });
    if (!code) {
      const plaintext = randomBytes(8).toString("base64url").slice(0, 12).toUpperCase();
      await db.insert(adminAccessCodesTable).values({
        codeHash: createHash("sha256").update(plaintext, "utf8").digest("hex"),
      });
      logger.warn(
        "bootstrap: seeded initial admin access code — retrieve hash from admin_access_codes table and rotate from /admin/settings",
      );
    }
  } catch (err) {
    logger.warn({ err }, "admin panel bootstrap failed");
  }
}

export default router;
