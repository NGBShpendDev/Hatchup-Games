import { Router } from "express";
import { db } from "@workspace/db";
import { userReportsTable, blockedUsersTable, playersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// POST /api/players/:id/block
router.post("/players/:id/block", async (req, res) => {
  const blockerId = Number(req.params.id);
  const body = req.body as { targetId?: unknown };
  const targetId = Number(body.targetId);
  if (!targetId || isNaN(targetId) || blockerId === targetId) {
    res.status(400).json({ error: "Invalid targetId" });
    return;
  }
  try {
    await db
      .insert(blockedUsersTable)
      .values({ blockerId, blockedId: targetId })
      .onConflictDoNothing();
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "block user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/players/:id/block/:targetId
router.delete("/players/:id/block/:targetId", async (req, res) => {
  const blockerId = Number(req.params.id);
  const blockedId = Number(req.params.targetId);
  await db
    .delete(blockedUsersTable)
    .where(and(eq(blockedUsersTable.blockerId, blockerId), eq(blockedUsersTable.blockedId, blockedId)));
  res.json({ success: true });
});

// GET /api/players/:id/blocks
router.get("/players/:id/blocks", async (req, res) => {
  const blockerId = Number(req.params.id);
  const blocks = await db
    .select()
    .from(blockedUsersTable)
    .where(eq(blockedUsersTable.blockerId, blockerId))
    .orderBy(desc(blockedUsersTable.createdAt));
  res.json(blocks);
});

// POST /api/reports
router.post("/reports", async (req, res) => {
  const reporterId = 1;
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
      .values({
        reporterId,
        reportedUserId,
        reason,
        contentType,
        contentId,
        description,
        status: "open",
      })
      .returning();
    res.status(201).json(report);
  } catch (err) {
    req.log.error(err, "submit report error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/reports
router.get("/admin/reports", async (req, res) => {
  const { status } = req.query as { status?: string };
  const reports = status
    ? await db.select().from(userReportsTable).where(eq(userReportsTable.status, status)).orderBy(desc(userReportsTable.createdAt))
    : await db.select().from(userReportsTable).orderBy(desc(userReportsTable.createdAt));
  res.json(reports);
});

// PATCH /api/admin/reports/:id
router.patch("/admin/reports/:id", async (req, res) => {
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

// GET /api/players/:id/privacy-settings
router.get("/players/:id/privacy-settings", async (req, res) => {
  const id = Number(req.params.id);
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, id) });
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
router.patch("/players/:id/privacy-settings", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as {
    locationVisibility?: unknown;
    requireWorkoutApproval?: unknown;
    emergencyContactName?: unknown;
    emergencyContactPhone?: unknown;
  };

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
    .where(eq(playersTable.id, id))
    .returning();
  res.json({
    locationVisibility: updated.locationVisibility,
    requireWorkoutApproval: updated.requireWorkoutApproval,
    emergencyContactName: updated.emergencyContactName,
    emergencyContactPhone: updated.emergencyContactPhone,
  });
});

export default router;
