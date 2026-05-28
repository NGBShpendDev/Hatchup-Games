import { Router } from "express";
import { db } from "@workspace/db";
import { userReportsTable, blockedUsersTable, playersTable } from "@workspace/db";
import { eq, and, desc, or, inArray, notInArray } from "drizzle-orm";

const router = Router();

// ── Auth helper ─────────────────────────────────────────────────────────────
// In this MVP the caller sends their playerId in the request body / query.
// Ownership is validated by confirming the URL :id matches the caller's
// playerId.  Admin routes additionally require the caller's player row to
// have isAdmin = true.

async function resolveCallerPlayer(callerId: unknown) {
  if (callerId == null) return null;
  const id = Number(callerId);
  if (isNaN(id)) return null;
  return db.query.playersTable.findFirst({ where: eq(playersTable.id, id) }) ?? null;
}

// ── Block / Unblock ─────────────────────────────────────────────────────────

// POST /api/players/:id/block
// body: { callerId, targetId }
router.post("/players/:id/block", async (req, res) => {
  const urlId = Number(req.params.id);
  const body = req.body as { callerId?: unknown; targetId?: unknown };
  const callerId = Number(body.callerId);
  const targetId = Number(body.targetId);

  if (isNaN(callerId) || callerId !== urlId) {
    res.status(403).json({ error: "Forbidden: callerId must match the player URL" });
    return;
  }
  if (!targetId || isNaN(targetId) || callerId === targetId) {
    res.status(400).json({ error: "Invalid targetId" });
    return;
  }
  try {
    await db
      .insert(blockedUsersTable)
      .values({ blockerId: callerId, blockedId: targetId })
      .onConflictDoNothing();
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "block user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/players/:id/block/:targetId
// query: ?callerId=
router.delete("/players/:id/block/:targetId", async (req, res) => {
  const urlId = Number(req.params.id);
  const callerId = Number(req.query.callerId);
  if (isNaN(callerId) || callerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const blockedId = Number(req.params.targetId);
  await db
    .delete(blockedUsersTable)
    .where(and(eq(blockedUsersTable.blockerId, callerId), eq(blockedUsersTable.blockedId, blockedId)));
  res.json({ success: true });
});

// GET /api/players/:id/blocks
// query: ?callerId=
router.get("/players/:id/blocks", async (req, res) => {
  const urlId = Number(req.params.id);
  const callerId = Number(req.query.callerId);
  if (isNaN(callerId) || callerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const blocks = await db
    .select()
    .from(blockedUsersTable)
    .where(eq(blockedUsersTable.blockerId, callerId))
    .orderBy(desc(blockedUsersTable.createdAt));
  res.json(blocks);
});

// ── Reports ─────────────────────────────────────────────────────────────────

// POST /api/reports
// body: { reporterId, reportedUserId?, reason, contentType?, contentId?, description? }
router.post("/reports", async (req, res) => {
  const body = req.body as {
    reporterId?: unknown;
    reportedUserId?: unknown;
    reason?: unknown;
    contentType?: unknown;
    contentId?: unknown;
    description?: unknown;
  };
  const reporterId = Number(body.reporterId);
  if (isNaN(reporterId) || reporterId < 1) {
    res.status(400).json({ error: "reporterId is required" });
    return;
  }
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

// GET /api/admin/reports?status=&adminId=
router.get("/admin/reports", async (req, res) => {
  const adminId = Number(req.query.adminId);
  if (isNaN(adminId)) {
    res.status(403).json({ error: "adminId required" });
    return;
  }
  const caller = await resolveCallerPlayer(adminId);
  if (!caller || !(caller as { isAdmin?: boolean }).isAdmin) {
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
// body: { adminId, status }
router.patch("/admin/reports/:id", async (req, res) => {
  const body = req.body as { adminId?: unknown; status?: string };
  const adminId = Number(body.adminId);
  if (isNaN(adminId)) {
    res.status(403).json({ error: "adminId required" });
    return;
  }
  const caller = await resolveCallerPlayer(adminId);
  if (!caller || !(caller as { isAdmin?: boolean }).isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const id = Number(req.params.id);
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
// query: ?callerId=
router.get("/players/:id/privacy-settings", async (req, res) => {
  const urlId = Number(req.params.id);
  const callerId = Number(req.query.callerId ?? req.query.playerId ?? urlId);
  // Allow self-access only
  if (callerId !== urlId) {
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
  });
});

const VALID_VISIBILITY = ["exact", "neighborhood", "city", "hidden"] as const;

// PATCH /api/players/:id/privacy-settings
// body: { callerId, locationVisibility?, requireWorkoutApproval?, emergencyContactName?, emergencyContactPhone? }
router.patch("/players/:id/privacy-settings", async (req, res) => {
  const urlId = Number(req.params.id);
  const body = req.body as {
    callerId?: unknown;
    locationVisibility?: unknown;
    requireWorkoutApproval?: unknown;
    emergencyContactName?: unknown;
    emergencyContactPhone?: unknown;
  };
  const callerId = Number(body.callerId ?? urlId);
  if (callerId !== urlId) {
    res.status(403).json({ error: "Forbidden" });
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

  const [updated] = await db
    .update(playersTable)
    .set(updates)
    .where(eq(playersTable.id, urlId))
    .returning();
  res.json({
    locationVisibility: updated.locationVisibility,
    requireWorkoutApproval: updated.requireWorkoutApproval,
    emergencyContactName: updated.emergencyContactName,
    emergencyContactPhone: updated.emergencyContactPhone,
  });
});

// ── Block-aware list helpers (exported for use in other routers) ──────────────

/**
 * Given a viewer's playerId, returns the set of playerIds that should be hidden:
 * anyone the viewer has blocked, or who has blocked the viewer.
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
