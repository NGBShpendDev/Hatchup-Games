import { Router } from "express";
import { db } from "@workspace/db";
import { userReportsTable, blockedUsersTable, playersTable, moderationAuditLogTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, or, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { emailResendLimiter, consumeEmailResendBudget } from "../middlewares/rateLimiters.ts";
import { issueEmailVerification } from "../services/emailVerification.ts";
import { isEmailBouncing, recordEmailBounce, clearEmailBounce } from "../services/bouncedEmails.ts";
import { notifyModerationAction } from "../services/moderationNotify.ts";

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

// ── Moderation audit log helper ──────────────────────────────────────────────

type AuditAction =
  | "suspend"
  | "unsuspend"
  | "verify"
  | "unverify"
  | "resolve_report"
  | "dismiss_report"
  | "reopen_report";

async function writeAuditLog(entry: {
  actorId: number;
  action: AuditAction;
  targetPlayerId?: number | null;
  targetReportId?: number | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(moderationAuditLogTable).values({
      actorId: entry.actorId,
      action: entry.action,
      targetPlayerId: entry.targetPlayerId ?? null,
      targetReportId: entry.targetReportId ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    });
  } catch {
    // Audit logging is best-effort; never break the moderation action itself.
  }
}

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
  const reason = typeof (req.body as { reason?: unknown })?.reason === "string"
    ? ((req.body as { reason: string }).reason).trim().slice(0, 500) || null
    : null;
  const [updated] = await db
    .update(userReportsTable)
    .set({ status, resolvedAt: new Date() })
    .where(eq(userReportsTable.id, id))
    .returning();
  if (updated) {
    await writeAuditLog({
      actorId: caller.id,
      action: status === "resolved" ? "resolve_report" : "dismiss_report",
      targetReportId: updated.id,
      targetPlayerId: updated.reportedUserId ?? null,
      reason,
    });
  }
  res.json(updated);
});

// GET /api/admin/audit?actorId=&targetPlayerId=&action=&limit=
router.get("/admin/audit", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const { actorId, targetPlayerId, action } = req.query as {
    actorId?: string;
    targetPlayerId?: string;
    action?: string;
  };
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 100;

  const filters: SQL[] = [];
  if (actorId) {
    const n = Number(actorId);
    if (Number.isFinite(n)) filters.push(eq(moderationAuditLogTable.actorId, n));
  }
  if (targetPlayerId) {
    const n = Number(targetPlayerId);
    if (Number.isFinite(n)) filters.push(eq(moderationAuditLogTable.targetPlayerId, n));
  }
  if (action) {
    filters.push(eq(moderationAuditLogTable.action, action));
  }

  const rows = filters.length
    ? await db.select().from(moderationAuditLogTable).where(and(...filters)).orderBy(desc(moderationAuditLogTable.createdAt)).limit(limit)
    : await db.select().from(moderationAuditLogTable).orderBy(desc(moderationAuditLogTable.createdAt)).limit(limit);

  // Determine which of these entries have already been undone by a later
  // entry whose metadata.undoOf points back at them. We grab every audit row
  // whose metadata mentions undoOf and project that into a set of original
  // ids for O(1) lookup. Using a LIKE filter keeps this cheap even on large
  // logs since most rows have NULL metadata.
  const undoRows = await db
    .select({ id: moderationAuditLogTable.id, metadata: moderationAuditLogTable.metadata })
    .from(moderationAuditLogTable);
  const undoneIds = new Set<number>();
  const undoEntryByOriginal = new Map<number, number>();
  for (const r of undoRows) {
    if (!r.metadata) continue;
    const parsed = safeParseJson(r.metadata) as { undoOf?: unknown } | null;
    const undoOf = parsed && typeof parsed === "object" ? Number((parsed as { undoOf?: unknown }).undoOf) : NaN;
    if (Number.isFinite(undoOf)) {
      undoneIds.add(undoOf);
      undoEntryByOriginal.set(undoOf, r.id);
    }
  }

  res.json(rows.map(r => {
    const parsedMeta = r.metadata ? safeParseJson(r.metadata) : null;
    const isUndoEntry =
      parsedMeta != null &&
      typeof parsedMeta === "object" &&
      Number.isFinite(Number((parsedMeta as { undoOf?: unknown }).undoOf));
    return {
      ...r,
      createdAt: r.createdAt.toISOString(),
      metadata: parsedMeta,
      isUndoable: UNDOABLE_ACTIONS.has(r.action as AuditAction)
        && !isUndoEntry
        && !undoneIds.has(r.id)
        && Date.now() - r.createdAt.getTime() <= UNDO_WINDOW_MS,
      isUndone: undoneIds.has(r.id),
      isUndoEntry,
      undoOfId: isUndoEntry ? Number((parsedMeta as { undoOf?: unknown }).undoOf) : null,
      undoneByEntryId: undoEntryByOriginal.get(r.id) ?? null,
    };
  }));
});

// Window during which an audit entry can be undone. Tweak via UNDO_WINDOW_HOURS.
const UNDO_WINDOW_MS =
  (Number.isFinite(Number(process.env.UNDO_WINDOW_HOURS))
    ? Number(process.env.UNDO_WINDOW_HOURS)
    : 24 * 7) * 60 * 60 * 1000;

const UNDOABLE_ACTIONS = new Set<AuditAction>([
  "suspend",
  "verify",
  "resolve_report",
  "dismiss_report",
]);

// POST /api/admin/audit/:id/undo
// Reverses a moderation action and records a new audit entry that references
// the original via metadata.undoOf. Refuses if the entry is already undone,
// is itself an undo entry, isn't a reversible action, or is older than the
// configured window.
router.post("/admin/audit/:id/undo", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const entry = await db.query.moderationAuditLogTable.findFirst({
    where: eq(moderationAuditLogTable.id, id),
  });
  if (!entry) {
    res.status(404).json({ error: "Audit entry not found" });
    return;
  }
  if (!UNDOABLE_ACTIONS.has(entry.action as AuditAction)) {
    res.status(400).json({ error: "Action is not reversible" });
    return;
  }
  // Reject undo-of-an-undo.
  const parsedMeta = entry.metadata ? safeParseJson(entry.metadata) : null;
  if (parsedMeta && typeof parsedMeta === "object" && (parsedMeta as { undoOf?: unknown }).undoOf != null) {
    res.status(400).json({ error: "Cannot undo an undo entry" });
    return;
  }
  // Reject if already undone — look for any audit row whose metadata.undoOf
  // equals this entry's id.
  const allMeta = await db
    .select({ id: moderationAuditLogTable.id, metadata: moderationAuditLogTable.metadata })
    .from(moderationAuditLogTable);
  const alreadyUndone = allMeta.some((r) => {
    if (!r.metadata) return false;
    const p = safeParseJson(r.metadata) as { undoOf?: unknown } | null;
    return p && typeof p === "object" && Number((p as { undoOf?: unknown }).undoOf) === entry.id;
  });
  if (alreadyUndone) {
    res.status(409).json({ error: "Already undone" });
    return;
  }
  if (Date.now() - entry.createdAt.getTime() > UNDO_WINDOW_MS) {
    res.status(400).json({ error: "Undo window expired" });
    return;
  }

  let undoAction: AuditAction;
  switch (entry.action as AuditAction) {
    case "suspend": {
      if (entry.targetPlayerId == null) {
        res.status(400).json({ error: "Audit entry missing target player" });
        return;
      }
      await db
        .update(playersTable)
        .set({ isSuspended: false, suspendedAt: null })
        .where(eq(playersTable.id, entry.targetPlayerId));
      undoAction = "unsuspend";
      break;
    }
    case "verify": {
      if (entry.targetPlayerId == null) {
        res.status(400).json({ error: "Audit entry missing target player" });
        return;
      }
      await db
        .update(playersTable)
        .set({ isVerified: false })
        .where(eq(playersTable.id, entry.targetPlayerId));
      undoAction = "unverify";
      break;
    }
    case "resolve_report":
    case "dismiss_report": {
      if (entry.targetReportId == null) {
        res.status(400).json({ error: "Audit entry missing target report" });
        return;
      }
      await db
        .update(userReportsTable)
        .set({ status: "open", resolvedAt: null })
        .where(eq(userReportsTable.id, entry.targetReportId));
      undoAction = "reopen_report";
      break;
    }
    default: {
      res.status(400).json({ error: "Action is not reversible" });
      return;
    }
  }

  await writeAuditLog({
    actorId: caller.id,
    action: undoAction,
    targetPlayerId: entry.targetPlayerId,
    targetReportId: entry.targetReportId,
    reason: typeof (req.body as { reason?: unknown })?.reason === "string"
      ? ((req.body as { reason: string }).reason).trim().slice(0, 500) || null
      : null,
    metadata: { undoOf: entry.id, originalAction: entry.action },
  });

  res.json({ success: true, undoneEntryId: entry.id });
});

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

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
  // Derive the timestamp of the most recently delivered scheduled weekly
  // recap from the notifications row the scheduler inserts. We only look at
  // type="nutrition_recap" (the real delivery), never "nutrition_recap_preview",
  // so preview sends don't get surfaced as the real last-sent time.
  const lastRecap = await db.query.notificationsTable.findFirst({
    where: and(
      eq(notificationsTable.playerId, urlId),
      eq(notificationsTable.type, "nutrition_recap"),
    ),
    orderBy: [desc(notificationsTable.createdAt)],
    columns: { createdAt: true },
  });
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
    weeklyRecapLastSentAt: lastRecap?.createdAt.toISOString() ?? null,
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
      // Refuse to even save an address that's on the bounce list — there's no
      // point storing it since every send will be skipped. The user gets a
      // clear `email_bouncing` error so they know to pick another address.
      if (await isEmailBouncing(normalized)) {
        res.status(400).json({
          error: "email_bouncing",
          message: "That address has been bouncing our confirmation emails. Please use a different inbox.",
        });
        return;
      }
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
  let verificationRateLimited = false;
  let verificationBouncing = false;
  if (newEmailToVerify) {
    // Share the per-player budget with POST /email/resend-verification so a
    // noisy client can't bypass the cap by toggling the email field on PATCH.
    // We consume programmatically (rather than mounting the limiter) so the
    // rest of the privacy update still commits if the implicit send is over
    // the limit — the new address is saved and the user can hit the explicit
    // Resend button later once the window resets.
    if (!(await consumeEmailResendBudget({ playerId: req.playerId, ip: req.ip }))) {
      verificationRateLimited = true;
    } else {
      try {
        const result = await issueEmailVerification(
          urlId,
          newEmailToVerify,
          updated.displayName ?? updated.username,
        );
        verificationSent = result === "sent";
        verificationBouncing = result === "bouncing";
      } catch (err) {
        req.log.warn({ err, playerId: urlId }, "failed to issue email verification");
      }
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
    emailVerificationRateLimited: verificationRateLimited,
    emailVerificationBouncing: verificationBouncing,
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
router.post("/email/resend-verification", requireAuth, attachPlayer, emailResendLimiter, async (req, res) => {
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
    const result = await issueEmailVerification(
      player.id,
      player.email,
      player.displayName ?? player.username,
    );
    if (result === "bouncing") {
      // Bounce list short-circuited the send. Tell the user clearly so they
      // can update their email instead of retrying into the void.
      res.status(400).json({
        error: "email_bouncing",
        message: "That address has been bouncing our confirmation emails. Update your email in privacy settings to use a different inbox.",
      });
      return;
    }
    res.json({ alreadyVerified: false, sent: result === "sent" });
  } catch (err) {
    req.log.error(err, "resend email verification failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/email/bounce-webhook
// Resend-compatible webhook endpoint. The provider POSTs JSON like:
//   { type: "email.bounced", data: { to: ["a@b.com"], bounce: { type: "hard", message: "..." } } }
//   { type: "email.complained", data: { to: ["a@b.com"] } }
// We authenticate via a shared secret in the `x-webhook-secret` header
// (configured both on the provider and in `RESEND_WEBHOOK_SECRET`). Anything
// without a configured secret rejects with 401 so we don't accidentally
// accept anonymous writes to the bounce list.
router.post("/email/bounce-webhook", async (req, res) => {
  const expected = process.env.RESEND_WEBHOOK_SECRET;
  if (!expected) {
    req.log.warn("bounce webhook hit but RESEND_WEBHOOK_SECRET is not configured");
    res.status(401).json({ error: "webhook_not_configured" });
    return;
  }
  const provided = req.headers["x-webhook-secret"];
  const providedStr = Array.isArray(provided) ? provided[0] : provided;
  if (providedStr !== expected) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  const body = req.body as {
    type?: unknown;
    data?: {
      to?: unknown;
      email?: unknown;
      bounce?: { type?: unknown; message?: unknown; subType?: unknown } | null;
    } | null;
  } | null;
  const eventType = typeof body?.type === "string" ? body.type : "";

  // Map provider event types to our internal bounce categories. We only
  // persist durable failures — soft/transient bounces are filtered inside
  // `recordEmailBounce`.
  let bounceType: string | null = null;
  if (eventType === "email.bounced") {
    const providerType = typeof body?.data?.bounce?.type === "string"
      ? body.data.bounce.type.toLowerCase()
      : "hard";
    bounceType = providerType;
  } else if (eventType === "email.complained" || eventType === "email.complaint") {
    bounceType = "complaint";
  }
  if (!bounceType) {
    // Other event types (delivered, opened, clicked, ...) are acknowledged
    // but not acted on. 200 keeps the provider from retrying.
    res.json({ ignored: true });
    return;
  }

  // Provider sends `to` as an array of strings; older payloads use `email`.
  const rawTo = body?.data?.to;
  const recipients: string[] = Array.isArray(rawTo)
    ? rawTo.filter((x): x is string => typeof x === "string")
    : typeof body?.data?.email === "string"
      ? [body.data.email]
      : [];
  const reason = typeof body?.data?.bounce?.message === "string"
    ? body.data.bounce.message.slice(0, 500)
    : null;

  let recorded = 0;
  for (const addr of recipients) {
    const ok = await recordEmailBounce({
      email: addr,
      bounceType,
      reason,
      source: "resend.webhook",
    });
    if (ok) recorded += 1;
  }
  req.log.info({ eventType, recorded, total: recipients.length }, "bounce webhook processed");
  res.json({ received: true, recorded });
});

// POST /api/email/bounce-clear
// Admin escape hatch: wipe an address from the bounce list (e.g. after a user
// reports the bounce was a transient outage). Admin-only.
router.post("/email/bounce-clear", requireAuth, attachPlayer, async (req, res) => {
  const caller = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!caller?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const body = req.body as { email?: unknown };
  const email = typeof body.email === "string" ? body.email : "";
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }
  const cleared = await clearEmailBounce(email);
  res.json({ cleared });
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
      suspensionReason: playersTable.suspensionReason,
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

  const suspendReason = typeof (req.body as { reason?: unknown })?.reason === "string"
    ? ((req.body as { reason: string }).reason).trim().slice(0, 500) || null
    : null;

  const [updated] = await db
    .update(playersTable)
    .set({
      isSuspended: body.isSuspended,
      suspendedAt: body.isSuspended ? new Date() : null,
      suspensionReason: body.isSuspended ? suspendReason : null,
    })
    .where(eq(playersTable.id, targetId))
    .returning({
      id: playersTable.id,
      username: playersTable.username,
      isSuspended: playersTable.isSuspended,
      suspendedAt: playersTable.suspendedAt,
      suspensionReason: playersTable.suspensionReason,
    });
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  req.log.info(
    { adminId: caller.id, targetId, isSuspended: body.isSuspended },
    "admin toggled account suspension",
  );
  await writeAuditLog({
    actorId: caller.id,
    action: body.isSuspended ? "suspend" : "unsuspend",
    targetPlayerId: targetId,
    reason: suspendReason,
  });
  void notifyModerationAction(targetId, body.isSuspended ? "suspend" : "unsuspend", suspendReason);
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
  const verifyReason = typeof (req.body as { reason?: unknown })?.reason === "string"
    ? ((req.body as { reason: string }).reason).trim().slice(0, 500) || null
    : null;

  const [updated] = await db
    .update(playersTable)
    .set({ isVerified: true })
    .where(eq(playersTable.id, targetId))
    .returning({ id: playersTable.id, username: playersTable.username, isVerified: playersTable.isVerified });
  if (!updated) { res.status(404).json({ error: "Player not found" }); return; }

  // Auto-resolve any pending verification_request reports for this player
  const autoResolved = await db
    .update(userReportsTable)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(
      eq(userReportsTable.reportedUserId, targetId),
      eq(userReportsTable.contentType, "verification"),
      eq(userReportsTable.status, "open"),
    ))
    .returning({ id: userReportsTable.id });

  await writeAuditLog({
    actorId: caller.id,
    action: "verify",
    targetPlayerId: targetId,
    reason: verifyReason,
    metadata: autoResolved.length ? { autoResolvedReportIds: autoResolved.map(r => r.id) } : null,
  });
  void notifyModerationAction(targetId, "verify", verifyReason);

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

/**
 * Canonical people-discovery exclusion rule. Used by /players/nearby,
 * /players/search, and /leaderboards/scoped so the safety policy lives in
 * exactly one place.
 *
 * Drops any player who:
 *   - is blocked by the viewer or has blocked the viewer (`getHiddenPlayerIds`)
 *   - fails the visibility predicate (default: `locationVisibility === "hidden"`
 *     is excluded; pass a custom predicate for scope-aware boards)
 *   - is flagged as a minor account
 *
 * The viewer themselves is NOT removed — leaderboard surfaces need the viewer
 * row in the result set to compute "my position / my entry". Callers that want
 * to exclude self should do so at the query layer (e.g. `ne(players.id, me)`).
 */
export async function filterDiscoverableCandidates<
  T extends { id: number; locationVisibility: string | null; isMinor: boolean | null },
>(
  viewerId: number | null | undefined,
  players: T[],
  options?: { allowVisibility?: (visibility: string | null) => boolean },
): Promise<T[]> {
  const blockedIds = viewerId
    ? new Set(await getHiddenPlayerIds(viewerId))
    : new Set<number>();
  const allowVisibility = options?.allowVisibility ?? ((v) => v !== "hidden");
  return players.filter(
    (p) =>
      !blockedIds.has(p.id) &&
      allowVisibility(p.locationVisibility) &&
      !p.isMinor,
  );
}

export default router;
