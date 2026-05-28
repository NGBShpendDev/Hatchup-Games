import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";

const router = Router();

const ALLOWED_TYPES = new Set([
  "challenge_invite",
  "challenge_ending",
  "challenge_complete",
  "club_mention",
  "club_invite",
  "artifact_unlock",
  "rematch_invite",
  "generic",
]);

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

// ── Upsert a notification (idempotent on player+type+sourceId) ─────────────
// Used by client-side detectors (e.g. challenge ending soon / completed) so
// transient toasts also land in the persistent inbox.
router.post("/notifications", requireAuth, attachPlayer, async (req, res) => {
  const body = req.body as {
    type?: string;
    title?: string;
    body?: string;
    link?: string;
    sourceId?: number | null;
  };

  const type = String(body.type ?? "").trim();
  const title = String(body.title ?? "").trim();
  if (!type || !ALLOWED_TYPES.has(type)) {
    res.status(400).json({ error: "invalid_type" });
    return;
  }
  if (!title) {
    res.status(400).json({ error: "title_required" });
    return;
  }

  const sourceId = typeof body.sourceId === "number" ? body.sourceId : null;

  if (sourceId !== null) {
    const existing = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.playerId, req.playerId!),
        eq(notificationsTable.type, type),
        eq(notificationsTable.sourceId, sourceId),
      ),
    });
    if (existing) {
      res.json({ ...existing, createdAt: existing.createdAt.toISOString(), deduped: true });
      return;
    }
  }

  const [row] = await db.insert(notificationsTable).values({
    playerId: req.playerId!,
    type,
    title,
    body: String(body.body ?? ""),
    link: String(body.link ?? ""),
    sourceId,
  }).returning();

  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

// ── Mark all as read ───────────────────────────────────────────────────────
router.post("/notifications/mark-all-read", requireAuth, attachPlayer, async (req, res) => {
  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.playerId, req.playerId!), eq(notificationsTable.read, false)));

  res.json({ success: true });
});

export default router;
