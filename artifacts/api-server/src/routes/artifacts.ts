import { Router } from "express";
import { db } from "@workspace/db";
import {
  artifactsTable,
  playerArtifactsTable,
  playersTable,
  artifactLoadoutsTable,
  artifactBattleXpTable,
} from "@workspace/db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import {
  getPlayerFitnessBars,
  checkAndAwardArtifacts,
  getRecentWorldNotifications,
} from "../services/artifactService.ts";
import { computePowerScore } from "../services/artifactLoadoutService.ts";

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
    // ALL undiscovered artifacts appear as silhouettes — not just hidden ones
    const mask = !discovered;

    return {
      id: a.id,
      name: mask ? "???" : a.name,
      lore: mask
        ? (a.isHidden
          ? "A secret artifact. Keep training to reveal it."
          : "You haven't earned this artifact yet. Keep pushing your limits.")
        : a.lore,
      rarity: a.rarity,
      type: a.type,
      imageSlug: mask ? "mystery" : a.imageSlug,
      isHidden: a.isHidden,
      abilities: mask ? [] : (a.abilities as unknown[]),
      discovered,
      isEquipped: playerOwned?.isEquipped ?? false,
      isFeatured: playerOwned?.isFeatured ?? false,
      featuredOrder: playerOwned?.featuredOrder ?? null,
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
    orderBy: (t, { desc, sql: sqlFn }) => [sqlFn`${t.featuredOrder} asc nulls last`, desc(t.earnedAt)],
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
      featuredOrder: o.featuredOrder,
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

  // Assign next featuredOrder when featuring; clear it when unfeaturing.
  let nextFeaturedOrder: number | null = owned.featuredOrder;
  if (isFeatured === true && !owned.isFeatured) {
    const others = await db.query.playerArtifactsTable.findMany({
      where: and(eq(playerArtifactsTable.playerId, playerId), eq(playerArtifactsTable.isFeatured, true)),
    });
    const maxOrder = others.reduce((m, o) => Math.max(m, o.featuredOrder ?? 0), 0);
    nextFeaturedOrder = maxOrder + 1;
  } else if (isFeatured === false) {
    nextFeaturedOrder = null;
  }

  const updated = await db.update(playerArtifactsTable)
    .set({
      isEquipped: isEquipped ?? owned.isEquipped,
      isFeatured: isFeatured ?? owned.isFeatured,
      featuredOrder: nextFeaturedOrder,
    })
    .where(eq(playerArtifactsTable.id, owned.id))
    .returning();

  const row = updated[0]!;
  const artifact = await db.query.artifactsTable.findFirst({
    where: eq(artifactsTable.id, row.artifactId),
  });
  if (!artifact) { res.status(404).json({ error: "Artifact not found" }); return; }

  res.json({
    id: artifact.id,
    name: artifact.name,
    lore: artifact.lore,
    rarity: artifact.rarity,
    type: artifact.type,
    imageSlug: artifact.imageSlug,
    abilities: artifact.abilities as unknown[],
    isEquipped: row.isEquipped,
    isFeatured: row.isFeatured,
    featuredOrder: row.featuredOrder,
    earnedAt: row.earnedAt.toISOString(),
  });
});

// ── POST /players/me/featured-swap ───────────────────────────────────────────
// Atomically unfeature one artifact and feature another in a single DB
// transaction so a swap can never leave the player half-updated.
const SwapSchema = z.object({
  removeId: z.number().int().positive(),
  addId:    z.number().int().positive(),
});

router.post("/players/me/featured-swap", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const body = SwapSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { removeId, addId } = body.data;
  if (removeId === addId) { res.status(400).json({ error: "removeId and addId must differ" }); return; }

  try {
    await db.transaction(async (tx) => {
      const owned = await tx.query.playerArtifactsTable.findMany({
        where: and(
          eq(playerArtifactsTable.playerId, playerId),
          inArray(playerArtifactsTable.artifactId, [removeId, addId]),
        ),
      });
      const outgoing = owned.find(o => o.artifactId === removeId);
      const incoming = owned.find(o => o.artifactId === addId);
      if (!outgoing || !incoming) {
        const err = new Error("not_owned"); (err as Error & { status?: number }).status = 404;
        throw err;
      }
      if (!outgoing.isFeatured) {
        const err = new Error("remove_not_featured"); (err as Error & { status?: number }).status = 400;
        throw err;
      }
      // Hand the outgoing artifact's slot directly to the incoming one so the
      // overall featured order is preserved.
      const slot = outgoing.featuredOrder;
      await tx.update(playerArtifactsTable)
        .set({ isFeatured: false, featuredOrder: null })
        .where(eq(playerArtifactsTable.id, outgoing.id));
      await tx.update(playerArtifactsTable)
        .set({ isFeatured: true, featuredOrder: slot })
        .where(eq(playerArtifactsTable.id, incoming.id));
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = (err as Error).message;
    if (status === 404) { res.status(404).json({ error: "Artifact not owned" }); return; }
    if (status === 400) { res.status(400).json({ error: message }); return; }
    throw err;
  }

  // Return the player's current featured list so the client can reconcile
  // without an extra round-trip.
  const featuredOwned = await db.query.playerArtifactsTable.findMany({
    where: and(eq(playerArtifactsTable.playerId, playerId), eq(playerArtifactsTable.isFeatured, true)),
    orderBy: (t, { sql: sqlFn }) => [sqlFn`${t.featuredOrder} asc nulls last`],
  });
  const artifactIds = featuredOwned.map(o => o.artifactId);
  const artifacts = artifactIds.length === 0 ? [] : await db.query.artifactsTable.findMany({
    where: (t, { inArray }) => inArray(t.id, artifactIds),
  });
  const aMap = new Map(artifacts.map(a => [a.id, a]));
  const featured = featuredOwned.map(o => {
    const a = aMap.get(o.artifactId);
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
      featuredOrder: o.featuredOrder,
      earnedAt: o.earnedAt.toISOString(),
    };
  }).filter(Boolean);

  res.json({ ok: true, removedId: removeId, addedId: addId, featured });
});

// ── PUT /players/me/featured-order ────────────────────────────────────────────
// Reorder featured artifacts. Body: { artifactIds: number[] } in desired order.
const ReorderSchema = z.object({
  artifactIds: z.array(z.number().int().positive()).max(10),
});

router.put("/players/me/featured-order", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const body = ReorderSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { artifactIds } = body.data;
  // Ensure uniqueness
  if (new Set(artifactIds).size !== artifactIds.length) {
    res.status(400).json({ error: "Duplicate artifactIds" }); return;
  }

  // Verify the player owns and has featured every artifact passed in.
  const owned = await db.query.playerArtifactsTable.findMany({
    where: and(eq(playerArtifactsTable.playerId, playerId), eq(playerArtifactsTable.isFeatured, true)),
  });
  const ownedFeaturedIds = new Set(owned.map(o => o.artifactId));
  const invalid = artifactIds.filter(id => !ownedFeaturedIds.has(id));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Not featured or not owned: ${invalid.join(", ")}` }); return;
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < artifactIds.length; i++) {
      await tx.update(playerArtifactsTable)
        .set({ featuredOrder: i + 1 })
        .where(and(
          eq(playerArtifactsTable.playerId, playerId),
          eq(playerArtifactsTable.artifactId, artifactIds[i]!),
        ));
    }
  });

  res.json({ ok: true, order: artifactIds });
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

// ── GET /artifacts/loadout/:hatchlingId ──────────────────────────────────────
router.get("/artifacts/loadout/:hatchlingId", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const hatchlingId = Number(req.params.hatchlingId);
  if (isNaN(hatchlingId)) { res.status(400).json({ error: "Invalid hatchlingId" }); return; }

  const loadout = await db.query.artifactLoadoutsTable.findFirst({
    where: and(
      eq(artifactLoadoutsTable.playerId, playerId),
      eq(artifactLoadoutsTable.hatchlingId, hatchlingId),
      eq(artifactLoadoutsTable.buildName, "Active"),
    ),
  });

  res.json(loadout ?? { playerId, hatchlingId, buildName: "Active", majorArtifactId: null, minorArtifact1Id: null, minorArtifact2Id: null, powerScore: 0 });
});

// ── POST /artifacts/loadout/:hatchlingId ─────────────────────────────────────
const SaveLoadoutSchema = z.object({
  majorArtifactId:  z.number().int().positive().nullable().optional(),
  minorArtifact1Id: z.number().int().positive().nullable().optional(),
  minorArtifact2Id: z.number().int().positive().nullable().optional(),
});

router.post("/artifacts/loadout/:hatchlingId", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const hatchlingId = Number(req.params.hatchlingId);
  if (isNaN(hatchlingId)) { res.status(400).json({ error: "Invalid hatchlingId" }); return; }

  const body = SaveLoadoutSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { majorArtifactId = null, minorArtifact1Id = null, minorArtifact2Id = null } = body.data;

  // Validate ownership: all non-null artifact IDs must be owned by the player
  const allIds = [majorArtifactId, minorArtifact1Id, minorArtifact2Id].filter((id): id is number => id !== null);
  if (allIds.length > 0) {
    const ownedRows = await db.query.playerArtifactsTable.findMany({
      where: and(eq(playerArtifactsTable.playerId, playerId)),
    });
    const ownedSet = new Set(ownedRows.map(o => o.artifactId));
    const notOwned = allIds.filter(id => !ownedSet.has(id));
    if (notOwned.length > 0) {
      res.status(403).json({ error: `Artifacts not owned: ${notOwned.join(", ")}` });
      return;
    }
  }

  // Compute power score
  let majorRarity: string | null = null;
  let minor1Rarity: string | null = null;
  let minor2Rarity: string | null = null;
  if (allIds.length > 0) {
    const artifacts = await db.query.artifactsTable.findMany({
      where: (t, { inArray }) => inArray(t.id, allIds),
    });
    const aMap = new Map(artifacts.map(a => [a.id, a.rarity]));
    majorRarity  = majorArtifactId  ? (aMap.get(majorArtifactId)  ?? null) : null;
    minor1Rarity = minorArtifact1Id ? (aMap.get(minorArtifact1Id) ?? null) : null;
    minor2Rarity = minorArtifact2Id ? (aMap.get(minorArtifact2Id) ?? null) : null;
  }
  const powerScore = computePowerScore(majorRarity, minor1Rarity, minor2Rarity);

  // Upsert active loadout (ON CONFLICT update)
  const [saved] = await db.insert(artifactLoadoutsTable)
    .values({ playerId, hatchlingId, buildName: "Active", majorArtifactId, minorArtifact1Id, minorArtifact2Id, powerScore, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [artifactLoadoutsTable.playerId, artifactLoadoutsTable.hatchlingId, artifactLoadoutsTable.buildName],
      set: { majorArtifactId, minorArtifact1Id, minorArtifact2Id, powerScore, updatedAt: new Date() },
    })
    .returning();

  res.json(saved);
});

// ── GET /artifacts/builds ─────────────────────────────────────────────────────
router.get("/artifacts/builds", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const builds = await db.query.artifactLoadoutsTable.findMany({
    where: and(eq(artifactLoadoutsTable.playerId, playerId)),
    orderBy: (t, { asc }) => [asc(t.hatchlingId), asc(t.buildName)],
  });
  res.json(builds.map(b => ({ ...b, updatedAt: b.updatedAt.toISOString(), createdAt: b.createdAt.toISOString() })));
});

// ── POST /artifacts/builds ────────────────────────────────────────────────────
const SaveBuildSchema = z.object({
  hatchlingId:      z.number().int().positive(),
  buildName:        z.string().min(1).max(40),
  majorArtifactId:  z.number().int().positive().nullable().optional(),
  minorArtifact1Id: z.number().int().positive().nullable().optional(),
  minorArtifact2Id: z.number().int().positive().nullable().optional(),
});

router.post("/artifacts/builds", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const body = SaveBuildSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { hatchlingId, buildName, majorArtifactId = null, minorArtifact1Id = null, minorArtifact2Id = null } = body.data;
  if (buildName === "Active") { res.status(400).json({ error: "Reserved build name" }); return; }

  const allIds = [majorArtifactId, minorArtifact1Id, minorArtifact2Id].filter((id): id is number => id !== null);
  let majorRarity: string | null = null, minor1Rarity: string | null = null, minor2Rarity: string | null = null;
  if (allIds.length > 0) {
    const artifacts = await db.query.artifactsTable.findMany({ where: (t, { inArray }) => inArray(t.id, allIds) });
    const aMap = new Map(artifacts.map(a => [a.id, a.rarity]));
    majorRarity  = majorArtifactId  ? (aMap.get(majorArtifactId)  ?? null) : null;
    minor1Rarity = minorArtifact1Id ? (aMap.get(minorArtifact1Id) ?? null) : null;
    minor2Rarity = minorArtifact2Id ? (aMap.get(minorArtifact2Id) ?? null) : null;
  }
  const powerScore = computePowerScore(majorRarity, minor1Rarity, minor2Rarity);

  const [saved] = await db.insert(artifactLoadoutsTable)
    .values({ playerId, hatchlingId, buildName, majorArtifactId, minorArtifact1Id, minorArtifact2Id, powerScore, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [artifactLoadoutsTable.playerId, artifactLoadoutsTable.hatchlingId, artifactLoadoutsTable.buildName],
      set: { majorArtifactId, minorArtifact1Id, minorArtifact2Id, powerScore, updatedAt: new Date() },
    })
    .returning();

  res.json({ ...saved, updatedAt: saved!.updatedAt.toISOString(), createdAt: saved!.createdAt.toISOString() });
});

// ── DELETE /artifacts/builds/:id ──────────────────────────────────────────────
router.delete("/artifacts/builds/:id", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const buildId = Number(req.params.id);
  if (isNaN(buildId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const build = await db.query.artifactLoadoutsTable.findFirst({
    where: and(eq(artifactLoadoutsTable.id, buildId), eq(artifactLoadoutsTable.playerId, playerId)),
  });
  if (!build) { res.status(404).json({ error: "Build not found" }); return; }
  if (build.buildName === "Active") { res.status(400).json({ error: "Cannot delete active loadout" }); return; }

  await db.delete(artifactLoadoutsTable).where(eq(artifactLoadoutsTable.id, buildId));
  res.status(204).end();
});

// ── GET /artifacts/battle-xp ──────────────────────────────────────────────────
router.get("/artifacts/battle-xp", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const ownedRows = await db.query.playerArtifactsTable.findMany({
    where: eq(playerArtifactsTable.playerId, playerId),
  });
  if (ownedRows.length === 0) { res.json([]); return; }

  const ownedIds = ownedRows.map(o => o.id);
  const xpRows = await db.query.artifactBattleXpTable.findMany({
    where: (t, { inArray }) => inArray(t.playerArtifactId, ownedIds),
  });
  const xpMap = new Map(xpRows.map(x => [x.playerArtifactId, x]));

  const artifacts = await db.query.artifactsTable.findMany({
    where: (t, { inArray }) => inArray(t.id, ownedRows.map(o => o.artifactId)),
  });
  const aMap = new Map(artifacts.map(a => [a.id, a]));

  res.json(ownedRows.map(o => {
    const xp = xpMap.get(o.id);
    const artifact = aMap.get(o.artifactId);
    return {
      playerArtifactId: o.id,
      artifactId: o.artifactId,
      artifactName: artifact?.name ?? "",
      rarity: artifact?.rarity ?? "",
      imageSlug: artifact?.imageSlug ?? "",
      battleXp: xp?.battleXp ?? 0,
      evolutionStage: xp?.evolutionStage ?? 0,
    };
  }));
});

export default router;
