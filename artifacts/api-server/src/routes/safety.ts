import { Router } from "express";
import { db } from "@workspace/db";
import { userReportsTable, blockedUsersTable, playersTable } from "@workspace/db";
import { eq, and, desc, or, notInArray } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { issueEmailVerification } from "../services/emailVerification";

const router = Router();

// ── Block / Unblock ─────────────────────────────────────────────────────────

// POST /api/players/:id/block
// Authenticated: only the signed-in player can block on their own behalf.
router.post("/players/:id/block", requireAuth, attachPlayer, async (req, res) => {
  const urlId = Number(req.params.id);
  if (req.playerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = req.body as { targetId?: unknown };
  const targetId = Number(body.targetId);
  if (!targetId || isNaN(targetId) || urlId === targetId) {
    res.status(400).json({ error: "Invalid targetId" });
    return;
  }
  try {
    await db
      .insert(blockedUsersTable)
      .values({ blockerId: urlId, blockedId: targetId })
      .onConflictDoNothing();
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "block user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/players/:id/block/:targetId
router.delete("/players/:id/block/:targetId", requireAuth, attachPlayer, async (req, res) => {
  const urlId = Number(req.params.id);
  if (req.playerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const blockedId = Number(req.params.targetId);
  await db
    .delete(blockedUsersTable)
    .where(and(eq(blockedUsersTable.blockerId, urlId), eq(blockedUsersTable.blockedId, blockedId)));
  res.json({ success: true });
});

// GET /api/players/:id/blocks
router.get("/players/:id/blocks", requireAuth, attachPlayer, async (req, res) => {
  const urlId = Number(req.params.id);
  if (req.playerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const blocks = await db
    .select()
    .from(blockedUsersTable)
    .where(eq(blockedUsersTable.blockerId, urlId))
    .orderBy(desc(blockedUsersTable.createdAt));
  res.json(blocks);
});

// ── Reports ─────────────────────────────────────────────────────────────────

// POST /api/reports
// Uses the authenticated player's session ID as reporterId — never trust client.
router.post("/reports", requireAuth, attachPlayer, async (req, res) => {
  const reporterId = req.playerId!;
  const body = req.body as {
    reportedUserId?: unknown;
    reason?: unknown;
    contentType?: unknown;
    contentId?: unknown;
    description?: unknown;
  };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    res.status(400).json({ error: "reason is required" });
    return;
  }
  const reportedUserId = body.reportedUserId != null ? Number(body.reportedUserId) : undefined;
  const contentId = body.contentId != null ? Number(body.contentId) : undefined;
  const contentType = typeof body.contentType === "string" ? body.contentType : "profile";
  const description = typeof body.description === "string" ? body.description : undefined;

  try {
    const [report] = await db
      .insert(userReportsTable)
      .values({ reporterId, reportedUserId, reason, contentType, contentId, description, status: "open" })
      .returning();
    res.status(201).json(report);
  } catch (err) {
    req.log.error(err, "submit report error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin Moderation ─────────────────────────────────────────────────────────

// GET /api/admin/reports?status=
router.get("/admin/reports", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const { status } = req.query as { status?: string };
  const reports = status
    ? await db.select().from(userReportsTable).where(eq(userReportsTable.status, status)).orderBy(desc(userReportsTable.createdAt))
    : await db.select().from(userReportsTable).orderBy(desc(userReportsTable.createdAt));
  res.json(reports);
});

// PATCH /api/admin/reports/:id
// body: { status }
router.patch("/admin/reports/:id", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const id = Number(req.params.id);
  const body = req.body as { status?: string };
  const status = body.status ?? "";
  if (!["resolved", "dismissed"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [updated] = await db
    .update(userReportsTable)
    .set({ status, resolvedAt: new Date() })
    .where(eq(userReportsTable.id, id))
    .returning();
  res.json(updated);
});

// ── Privacy Settings ─────────────────────────────────────────────────────────

// GET /api/players/:id/privacy-settings
router.get("/players/:id/privacy-settings", requireAuth, attachPlayer, async (req, res) => {
  const urlId = Number(req.params.id);
  if (req.playerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, urlId) });
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({
    locationVisibility: player.locationVisibility,
    requireWorkoutApproval: player.requireWorkoutApproval,
    emergencyContactName: player.emergencyContactName,
    emergencyContactPhone: player.emergencyContactPhone,
    isVerified: player.isVerified,
    isMinor: player.isMinor,
    emailVerifiedAt: player.emailVerifiedAt?.toISOString() ?? null,
    weeklyRecapEnabled: player.weeklyRecapEnabled,
    weeklyRecapDayOfWeek: player.weeklyRecapDayOfWeek,
    weeklyRecapHourLocal: player.weeklyRecapHourLocal,
    weeklyRecapTzOffsetMinutes: player.weeklyRecapTzOffsetMinutes,
    weeklyRecapTimezone: player.weeklyRecapTimezone,
    email: player.email,
    notifyRecapEmail: player.notifyRecapEmail,
    notifyChampionEmail: player.notifyChampionEmail,
    notifyRecapPush: player.notifyRecapPush,
  });
});

const VALID_VISIBILITY = ["exact", "neighborhood", "city", "hidden"] as const;

// PATCH /api/players/:id/privacy-settings
// body: { locationVisibility?, requireWorkoutApproval?, emergencyContactName?, emergencyContactPhone? }
router.patch("/players/:id/privacy-settings", requireAuth, attachPlayer, async (req, res) => {
  const urlId = Number(req.params.id);
  if (req.playerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = req.body as {
    locationVisibility?: unknown;
    requireWorkoutApproval?: unknown;
    emergencyContactName?: unknown;
    emergencyContactPhone?: unknown;
    isMinor?: unknown;
    weeklyRecapEnabled?: unknown;
    weeklyRecapDayOfWeek?: unknown;
    weeklyRecapHourLocal?: unknown;
    weeklyRecapTzOffsetMinutes?: unknown;
    weeklyRecapTimezone?: unknown;
    email?: unknown;
    notifyRecapEmail?: unknown;
    notifyChampionEmail?: unknown;
    notifyRecapPush?: unknown;
  };

  // Read current player so we know if this is (or will become) a minor account.
  const current = await db.query.playersTable.findFirst({ where: eq(playersTable.id, urlId) });
  if (!current) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const updates: Partial<typeof playersTable.$inferInsert> = {};

  if (body.locationVisibility !== undefined) {
    const vis = body.locationVisibility as string;
    if (!VALID_VISIBILITY.includes(vis as (typeof VALID_VISIBILITY)[number])) {
      res.status(400).json({ error: "Invalid locationVisibility" });
      return;
    }
    updates.locationVisibility = vis;
  }
  if (typeof body.requireWorkoutApproval === "boolean") {
    updates.requireWorkoutApproval = body.requireWorkoutApproval;
  }
  if (body.emergencyContactName !== undefined) {
    updates.emergencyContactName = body.emergencyContactName as string | null;
  }
  if (body.emergencyContactPhone !== undefined) {
    updates.emergencyContactPhone = body.emergencyContactPhone as string | null;
  }
  if (typeof body.weeklyRecapEnabled === "boolean") {
    updates.weeklyRecapEnabled = body.weeklyRecapEnabled;
  }
  if (typeof body.weeklyRecapDayOfWeek === "number") {
    const d = body.weeklyRecapDayOfWeek;
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      res.status(400).json({ error: "Invalid weeklyRecapDayOfWeek" });
      return;
    }
    updates.weeklyRecapDayOfWeek = d;
  }
  if (typeof body.weeklyRecapHourLocal === "number") {
    const h = body.weeklyRecapHourLocal;
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      res.status(400).json({ error: "Invalid weeklyRecapHourLocal" });
      return;
    }
    updates.weeklyRecapHourLocal = h;
  }
  if (typeof body.weeklyRecapTzOffsetMinutes === "number") {
    const tz = body.weeklyRecapTzOffsetMinutes;
    if (!Number.isInteger(tz) || tz < -14 * 60 || tz > 14 * 60) {
      res.status(400).json({ error: "Invalid weeklyRecapTzOffsetMinutes" });
      return;
    }
    updates.weeklyRecapTzOffsetMinutes = tz;
  }
  if (body.weeklyRecapTimezone !== undefined) {
    const raw = body.weeklyRecapTimezone;
    if (raw === null || raw === "") {
      updates.weeklyRecapTimezone = null;
    } else if (typeof raw === "string" && raw.length <= 64) {
      // Validate against the host's ICU database. Unknown IANA names throw.
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: raw });
        updates.weeklyRecapTimezone = raw;
      } catch {
        res.status(400).json({ error: "Invalid weeklyRecapTimezone" });
        return;
      }
    } else {
      res.status(400).json({ error: "Invalid weeklyRecapTimezone" });
      return;
    }
  }
  // Track whether the email actually changed so we can fire a verification
  // email AFTER the row is persisted. We re-verify on every change (including
  // clearing) so we never leave a stale verified flag on a different address.
  let newEmailToVerify: string | null = null;
  if (body.email !== undefined) {
    const raw = body.email;
    if (raw === null || raw === "") {
      updates.email = null;
      if (current.email !== null) {
        updates.emailVerifiedAt = null;
        updates.emailVerificationToken = null;
        updates.emailVerificationExpiresAt = null;
      }
    } else if (typeof raw === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) {
      const normalized = raw.trim().toLowerCase();
      updates.email = normalized;
      if (normalized !== (current.email ?? null)) {
        // Address changed — clear any prior verification. issueEmailVerification
        // (called below, post-update) will set a fresh token + expiry.
        updates.emailVerifiedAt = null;
        updates.emailVerificationToken = null;
        updates.emailVerificationExpiresAt = null;
        newEmailToVerify = normalized;
      }
    } else {
      res.status(400).json({ error: "Invalid email" });
      return;
    }
  }
  if (typeof body.notifyRecapEmail === "boolean") {
    updates.notifyRecapEmail = body.notifyRecapEmail;
  }
  if (typeof body.notifyChampionEmail === "boolean") {
    updates.notifyChampionEmail = body.notifyChampionEmail;
  }
  if (typeof body.notifyRecapPush === "boolean") {
    updates.notifyRecapPush = body.notifyRecapPush;
  }
  if (typeof body.isMinor === "boolean") {
    // Minor status is a one-way self-service toggle: a user can mark
    // themselves as a minor at any time, but cannot self-clear that flag.
    // Removing minor status requires an admin (guardian) review path.
    if (body.isMinor === false && current.isMinor === true && !current.isAdmin) {
      res.status(403).json({
        error: "minor_status_immutable",
        message: "Removing minor status requires a guardian or admin. Please contact support.",
      });
      return;
    }
    if (body.isMinor === true) {
      updates.isMinor = true;
    }
  }

  // ── Minor-account safety enforcement ────────────────────────────────────────
  // If the account is (or will be) flagged as a minor, force safer defaults on
  // EVERY privacy update — regardless of payload order. This prevents loosening
  // a minor's settings by sending only `locationVisibility=exact` in a later request.
  const willBeMinor = typeof body.isMinor === "boolean" ? body.isMinor : current.isMinor;
  if (willBeMinor) {
    const UNSAFE_VISIBILITY = new Set(["exact", "neighborhood"]);
    const requestedVis = updates.locationVisibility ?? current.locationVisibility;
    if (UNSAFE_VISIBILITY.has(requestedVis as string)) {
      updates.locationVisibility = "city";
    }
    updates.requireWorkoutApproval = true;
  }

  const [updated] = await db
    .update(playersTable)
    .set(updates)
    .where(eq(playersTable.id, urlId))
    .returning();

  // Best-effort: send a verification email when the address changed. The
  // service overwrites the token/expiry we just cleared above, so a failed
  // send (e.g. provider unconfigured) still leaves the row in a consistent
  // unverified state with no usable token.
  let verificationSent = false;
  if (newEmailToVerify) {
    try {
      verificationSent = await issueEmailVerification(
        urlId,
        newEmailToVerify,
        updated.displayName ?? updated.username,
      );
    } catch (err) {
      req.log.warn({ err, playerId: urlId }, "failed to issue email verification");
    }
  }

  res.json({
    locationVisibility: updated.locationVisibility,
    requireWorkoutApproval: updated.requireWorkoutApproval,
    emergencyContactName: updated.emergencyContactName,
    emergencyContactPhone: updated.emergencyContactPhone,
    email: updated.email,
    emailVerifiedAt: updated.emailVerifiedAt?.toISOString() ?? null,
    emailVerificationSent: verificationSent,
    notifyRecapEmail: updated.notifyRecapEmail,
    notifyChampionEmail: updated.notifyChampionEmail,
    notifyRecapPush: updated.notifyRecapPush,
  });
});

// ── Email verification ──────────────────────────────────────────────────────

// GET /api/email/verify?token=...
// Public endpoint hit from the link in the verification email. Marks the
// player's email as verified and redirects them back to the settings page
// with a status query param the UI can surface.
router.get("/email/verify", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.redirect("/settings/privacy?emailVerify=missing");
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.emailVerificationToken, token),
  });
  if (!player) {
    res.redirect("/settings/privacy?emailVerify=invalid");
    return;
  }
  if (!player.emailVerificationExpiresAt || player.emailVerificationExpiresAt.getTime() < Date.now()) {
    res.redirect("/settings/privacy?emailVerify=expired");
    return;
  }
  await db
    .update(playersTable)
    .set({
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    })
    .where(eq(playersTable.id, player.id));
  res.redirect("/settings/privacy?emailVerify=ok");
});

// POST /api/email/resend-verification
// Re-issues the verification email for the signed-in player's current address.
router.post("/email/resend-verification", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  if (!player.email) {
    res.status(400).json({ error: "no_email_on_file" });
    return;
  }
  if (player.emailVerifiedAt) {
    res.json({ alreadyVerified: true, sent: false });
    return;
  }
  try {
    const sent = await issueEmailVerification(
      player.id,
      player.email,
      player.displayName ?? player.username,
    );
    res.json({ alreadyVerified: false, sent });
  } catch (err) {
    req.log.error(err, "resend email verification failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: list suspended accounts ──────────────────────────────────────────

// GET /api/admin/players/suspended
router.get("/admin/players/suspended", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      suspendedAt: playersTable.suspendedAt,
    })
    .from(playersTable)
    .where(eq(playersTable.isSuspended, true))
    .orderBy(desc(playersTable.suspendedAt));
  res.json(rows.map(r => ({
    ...r,
    suspendedAt: r.suspendedAt ? r.suspendedAt.toISOString() : null,
  })));
});

// ── Admin: suspend / unsuspend account ──────────────────────────────────────

// PATCH /api/admin/players/:id/suspend
// body: { isSuspended: boolean }
router.patch("/admin/players/:id/suspend", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const targetId = Number(req.params.id);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (targetId === caller.id) {
    res.status(400).json({ error: "Admins cannot suspend themselves" });
    return;
  }
  const body = req.body as { isSuspended?: unknown };
  if (typeof body.isSuspended !== "boolean") {
    res.status(400).json({ error: "isSuspended (boolean) is required" });
    return;
  }

  const [updated] = await db
    .update(playersTable)
    .set({
      isSuspended: body.isSuspended,
      suspendedAt: body.isSuspended ? new Date() : null,
    })
    .where(eq(playersTable.id, targetId))
    .returning({
      id: playersTable.id,
      username: playersTable.username,
      isSuspended: playersTable.isSuspended,
      suspendedAt: playersTable.suspendedAt,
    });
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  req.log.info(
    { adminId: caller.id, targetId, isSuspended: body.isSuspended },
    "admin toggled account suspension",
  );
  res.json({ success: true, player: updated });
});

// ── Admin: approve profile verification ─────────────────────────────────────

// POST /api/admin/players/:id/verify
// Sets players.isVerified = true. Admin only.
router.post("/admin/players/:id/verify", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const targetId = Number(req.params.id);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(playersTable)
    .set({ isVerified: true })
    .where(eq(playersTable.id, targetId))
    .returning({ id: playersTable.id, username: playersTable.username, isVerified: playersTable.isVerified });
  if (!updated) { res.status(404).json({ error: "Player not found" }); return; }

  // Auto-resolve any pending verification_request reports for this player
  await db
    .update(userReportsTable)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(
      eq(userReportsTable.reportedUserId, targetId),
      eq(userReportsTable.contentType, "verification"),
      eq(userReportsTable.status, "open"),
    ));

  res.json({ success: true, player: updated });
});

// ── Block-aware list helper (exported for other routers) ──────────────────────

/**
 * Returns the set of playerIds that should be hidden from viewerId's perspective:
 * anyone viewerId has blocked, or who has blocked viewerId.
 */
export async function getHiddenPlayerIds(viewerId: number): Promise<number[]> {
  const blocks = await db
    .select()
    .from(blockedUsersTable)
    .where(or(eq(blockedUsersTable.blockerId, viewerId), eq(blockedUsersTable.blockedId, viewerId)));
  const hidden = new Set<number>();
  for (const b of blocks) {
    hidden.add(b.blockerId);
    hidden.add(b.blockedId);
  }
  hidden.delete(viewerId);
  return [...hidden];
}

export default router;
