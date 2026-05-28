import { Router } from "express";
import { db } from "@workspace/db";
import { artifactsTable, playerArtifactsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import {
  getPlayerFitnessBars,
  checkAndAwardArtifacts,
  getRecentWorldNotifications,
} from "../services/artifactService";

const router = Router();

// ── GET /artifacts (museum — all artifacts, with per-player discovery state) ──
router.get("/artifacts", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const [allArtifacts, owned] = await Promise.all([
    db.query.artifactsTable.findMany({ orderBy: (t, { asc }) => [asc(t.rarity), asc(t.id)] }),
    db.query.playerArtifactsTable.findMany({ where: eq(playerArtifactsTable.playerId, playerId) }),
  ]);

  const ownedMap = new Map(owned.map(o => [o.artifactId, o]));

  const result = allArtifacts.map(a => {
    const playerOwned = ownedMap.get(a.id);
    const discovered = !!playerOwned;
    const isHiddenUndiscovered = a.isHidden && !discovered;

    return {
      id: a.id,
      name: isHiddenUndiscovered ? "???" : a.name,
      lore: isHiddenUndiscovered ? "Unlock this hidden artifact to reveal its lore." : a.lore,
      rarity: a.rarity,
      type: a.type,
      imageSlug: isHiddenUndiscovered ? "mystery" : a.imageSlug,
      isHidden: a.isHidden,
      abilities: isHiddenUndiscovered ? [] : (a.abilities as unknown[]),
      discovered,
      isEquipped: playerOwned?.isEquipped ?? false,
      isFeatured: playerOwned?.isFeatured ?? false,
      earnedAt: playerOwned?.earnedAt?.toISOString() ?? null,
    };
  });

  res.json(result);
});

// ── GET /players/me/artifacts ─────────────────────────────────────────────────
router.get("/players/me/artifacts", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const owned = await db.query.playerArtifactsTable.findMany({
    where: eq(playerArtifactsTable.playerId, playerId),
    orderBy: (t, { desc }) => [desc(t.earnedAt)],
  });

  const artifactIds = owned.map(o => o.artifactId);
  if (artifactIds.length === 0) { res.json([]); return; }

  const artifacts = await db.query.artifactsTable.findMany({
    where: (t, { inArray }) => inArray(t.id, artifactIds),
  });
  const artifactMap = new Map(artifacts.map(a => [a.id, a]));

  const result = owned.map(o => {
    const a = artifactMap.get(o.artifactId);
    if (!a) return null;
    return {
      id: a.id,
      name: a.name,
      lore: a.lore,
      rarity: a.rarity,
      type: a.type,
      imageSlug: a.imageSlug,
      abilities: a.abilities as unknown[],
      isEquipped: o.isEquipped,
      isFeatured: o.isFeatured,
      earnedAt: o.earnedAt.toISOString(),
    };
  }).filter(Boolean);

  res.json(result);
});

// ── GET /players/me/fitness-bars ──────────────────────────────────────────────
router.get("/players/me/fitness-bars", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const bars = await getPlayerFitnessBars(playerId);
  res.json(bars);
});

// ── PATCH /players/me/artifacts/:id (toggle equipped / featured) ──────────────
router.patch("/players/me/artifacts/:id", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const artifactId = Number(req.params.id);
  const { isEquipped, isFeatured } = req.body as { isEquipped?: boolean; isFeatured?: boolean };

  const owned = await db.query.playerArtifactsTable.findFirst({
    where: (t, { and, eq: eqFn }) => and(
      eqFn(t.playerId, playerId),
      eqFn(t.artifactId, artifactId),
    ),
  });
  if (!owned) { res.status(404).json({ error: "Artifact not owned" }); return; }

  const updated = await db.update(playerArtifactsTable)
    .set({
      isEquipped: isEquipped ?? owned.isEquipped,
      isFeatured: isFeatured ?? owned.isFeatured,
    })
    .where(eq(playerArtifactsTable.id, owned.id))
    .returning();

  res.json(updated[0]);
});

// ── GET /artifacts/world-notifications ───────────────────────────────────────
router.get("/artifacts/world-notifications", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 20);
  const notifications = await getRecentWorldNotifications(isNaN(limit) ? 10 : limit);
  res.json(notifications.map(n => ({
    id: n.id,
    playerUsername: n.playerUsername,
    artifactName: n.artifactName,
    rarity: n.rarity,
    createdAt: n.createdAt.toISOString(),
  })));
});

// ── POST /artifacts/check-milestones (manual trigger for testing/admin) ───────
router.post("/artifacts/check-milestones", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const newArtifacts = await checkAndAwardArtifacts(playerId, player.username);
  res.json({ awarded: newArtifacts.length, artifacts: newArtifacts });
});

export default router;
