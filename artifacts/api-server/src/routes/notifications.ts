import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";

const router = Router();

// ── List notifications ─────────────────────────────────────────────────────
router.get("/notifications", requireAuth, attachPlayer, async (req, res) => {
  const unreadOnly = req.query.unread === "true";
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const where = unreadOnly
    ? and(eq(notificationsTable.playerId, req.playerId!), eq(notificationsTable.read, false))
    : eq(notificationsTable.playerId, req.playerId!);

  const rows = await db.query.notificationsTable.findMany({
    where,
    orderBy: [desc(notificationsTable.createdAt)],
    limit,
  });

  res.json(rows.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

// ── Unread count ───────────────────────────────────────────────────────────
router.get("/notifications/unread-count", requireAuth, attachPlayer, async (req, res) => {
  const rows = await db.query.notificationsTable.findMany({
    where: and(eq(notificationsTable.playerId, req.playerId!), eq(notificationsTable.read, false)),
    columns: { id: true },
  });
  res.json({ count: rows.length });
});

// ── Mark single as read ────────────────────────────────────────────────────
router.post("/notifications/:id/read", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.playerId, req.playerId!)));

  res.json({ success: true });
});

// ── Mark all as read ───────────────────────────────────────────────────────
router.post("/notifications/mark-all-read", requireAuth, attachPlayer, async (req, res) => {
  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.playerId, req.playerId!), eq(notificationsTable.read, false)));

  res.json({ success: true });
});

export default router;
