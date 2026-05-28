import { Router } from "express";
import { db } from "@workspace/db";
import { hatchlingsTable, evolutionTypesTable, playersTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  ListHatchlingsQueryParams,
  CreateHatchlingBody,
  GetHatchlingParams,
  UpdateHatchlingParams,
  UpdateHatchlingBody,
  DeleteHatchlingParams,
  EvolveHatchlingParams,
  EvolveHatchlingBody,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth.ts";
import { attachEntitlement, enforceHatchlingCap } from "../services/subscriptionGuards.ts";

const router = Router();

// ── Mood state helpers ─────────────────────────────────────────────────────────
function computeMoodState(lastWorkoutAt: Date | null): string {
  if (!lastWorkoutAt) return "happy";
  const now = Date.now();
  const ms = now - lastWorkoutAt.getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 2) return "celebrating";
  if (hours > 24) return "resting";
  return "happy";
}

// ── Power score ────────────────────────────────────────────────────────────────
// Formula: level × 10 × rarityMultiplier + battleWins × 5
function computePowerScore(level: number, rarity: string | null, battleWins: number): number {
  const mult =
    rarity === "Celestial" ? 6 :
    rarity === "Ancient"   ? 5 :
    rarity === "Mythic"    ? 4 :
    rarity === "Legendary" ? 3 :
    rarity === "Epic"      ? 2 :
    rarity === "Rare"      ? 1.5 : 1;
  return Math.round(level * 10 * mult + battleWins * 5);
}

// ── Steps to evolution ─────────────────────────────────────────────────────────
// Stage 1→2 requires 500 cumulative XP; Stage 2→3 requires 1500.
// Each step ≈ 0.1 XP, so multiply XP gap by 10 to get steps.
const STAGE_XP_THRESHOLDS: Record<number, number> = { 1: 500, 2: 1500 };

function computeStepsToEvolution(xp: number, stage: number): number {
  const threshold = STAGE_XP_THRESHOLDS[stage];
  if (!threshold) return 0;
  return Math.max(0, (threshold - xp) * 10);
}

// ── Passive decay ──────────────────────────────────────────────────────────────
// Stats slowly fall over time. The decay rate is *halved* while a nutrition
// buff is active (set by POST /nutrition/posts when a high-quality meal is
// logged). This is what makes "eat well" feel like real care for the creature.
//
// Base rate: 1 point/hour off happiness, hunger, and energy.
// Buffed rate (nutritionBuffExpiresAt > now): 0.5 point/hour.
type DecayableHatchling = typeof hatchlingsTable.$inferSelect;

async function applyPassiveDecay(h: DecayableHatchling): Promise<DecayableHatchling> {
  const now = new Date();
  // For legacy rows where `lastDecayAt` was never written, treat "now" as the
  // baseline and persist it. This avoids zero-ing out long-lived hatchlings
  // by retroactively applying days of decay on first read after rollout.
  if (h.lastDecayAt == null) {
    await db.update(hatchlingsTable)
      .set({ lastDecayAt: now })
      .where(eq(hatchlingsTable.id, h.id));
    return { ...h, lastDecayAt: now };
  }
  const elapsedMs = now.getTime() - h.lastDecayAt.getTime();
  if (elapsedMs <= 0) return h;

  // Integrate decay across two segments so a buff that expires partway
  // through the elapsed window still slows decay for its active portion.
  //   buffed segment   (rate 0.5/hr): [lastDecayAt, min(now, buffExpiresAt)]
  //   unbuffed segment (rate 1/hr):   remaining time after buff expires
  const MS_PER_HOUR = 1000 * 60 * 60;
  const buffEnd = h.nutritionBuffExpiresAt?.getTime() ?? 0;
  const start = h.lastDecayAt.getTime();
  const end = now.getTime();
  const buffedMs   = Math.max(0, Math.min(end, buffEnd) - start);
  const unbuffedMs = Math.max(0, end - Math.max(start, buffEnd));
  const dropRaw = (buffedMs / MS_PER_HOUR) * 0.5 + (unbuffedMs / MS_PER_HOUR) * 1;
  // Don't bother writing unless decay is at least 1 full point — avoids churn on every read.
  if (dropRaw < 1) return h;
  const drop = Math.floor(dropRaw);

  const newHappiness = Math.max(0, h.happiness - drop);
  const newHunger    = Math.max(0, h.hunger    - drop);
  const newEnergy    = Math.max(0, h.energy    - drop);

  // Motivation decay: if the player has gone >24h without a workout,
  // motivation drops 1 pt per 4 extra hours beyond the 24h threshold.
  const MOTIVATION_GRACE_MS = 24 * 60 * 60 * 1000;
  const lastWorkoutMs = h.lastWorkoutAt?.getTime() ?? 0;
  const overdueMs = Math.max(0, now.getTime() - lastWorkoutMs - MOTIVATION_GRACE_MS);
  const motivationDrop = Math.floor(overdueMs / (4 * 60 * 60 * 1000));
  const newMotivation = motivationDrop > 0
    ? Math.max(0, (h.motivationScore ?? 50) - Math.min(motivationDrop, drop))
    : (h.motivationScore ?? 50);

  const decayPatch = motivationDrop > 0
    ? { happiness: newHappiness, hunger: newHunger, energy: newEnergy, lastDecayAt: now, motivationScore: newMotivation }
    : { happiness: newHappiness, hunger: newHunger, energy: newEnergy, lastDecayAt: now };

  await db.update(hatchlingsTable)
    .set(decayPatch)
    .where(eq(hatchlingsTable.id, h.id));

  return { ...h, happiness: newHappiness, hunger: newHunger, energy: newEnergy, motivationScore: newMotivation, lastDecayAt: now };
}

router.get("/hatchlings", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const query = ListHatchlingsQueryParams.safeParse({ playerId: req.query.playerId ? Number(req.query.playerId) : undefined, limit: req.query.limit ? Number(req.query.limit) : 20 });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const rawResults = await db.query.hatchlingsTable.findMany({
    where: query.data.playerId ? eq(hatchlingsTable.playerId, query.data.playerId) : undefined,
    limit: query.data.limit ?? 20,
    orderBy: [desc(hatchlingsTable.createdAt)],
  });
  const results = await Promise.all(rawResults.map(applyPassiveDecay));
  res.json(results.map(h => ({
    ...h,
    moodState: computeMoodState(h.lastWorkoutAt),
    powerScore: computePowerScore(h.level, h.rarity, h.battleWins),
    stepsToEvolution: computeStepsToEvolution(h.xp, h.evolutionStage),
    createdAt: h.createdAt.toISOString(),
    lastWorkoutAt: h.lastWorkoutAt?.toISOString() ?? null,
  })));
});

router.post("/hatchlings", requireAuth, attachPlayer, requirePlayerOwnership, attachEntitlement, enforceHatchlingCap, async (req, res) => {
  const body = CreateHatchlingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const realms = ["strength", "cardio", "balance", "beast"];
  const realm = realms[Math.floor(Math.random() * realms.length)];
  const genetics = {
    temperament: Math.floor(Math.random() * 100),
    energyType: Math.floor(Math.random() * 100),
    auraColor: Math.floor(Math.random() * 100),
    physique: Math.floor(Math.random() * 100),
    loyalty: Math.floor(Math.random() * 100),
    aggression: Math.floor(Math.random() * 100),
    mutationChance: Math.floor(Math.random() * 10),
  };
  const personalities = ["Sleepy", "Hyper", "Loyal", "Competitive", "Calm"];
  const personality = personalities[Math.floor(Math.random() * personalities.length)];
  const rarity = Math.random() < 0.05 ? "Legendary" : Math.random() < 0.15 ? "Epic" : Math.random() < 0.35 ? "Rare" : "Common";

  const hatchling = await db.insert(hatchlingsTable).values({
    playerId: body.data.playerId,
    name: body.data.name,
    species: body.data.species ?? "Mystery Pal",
    personality,
    realm,
    category: realm,
    rarity,
    mood: "excited",
    moodState: "happy",
    happiness: 90,
    hunger: 50,
    energy: 100,
    genetics,
    friendshipLevel: 0,
  }).returning();
  res.status(201).json({
    ...hatchling[0],
    createdAt: hatchling[0].createdAt.toISOString(),
    lastWorkoutAt: null,
  });
});

router.get("/hatchlings/showcase", async (req, res) => {
  const rawResults = await db.query.hatchlingsTable.findMany({
    orderBy: [desc(hatchlingsTable.level), desc(hatchlingsTable.xp)],
    limit: 8,
  });
  const results = await Promise.all(rawResults.map(applyPassiveDecay));
  res.json(results.map(h => ({
    ...h,
    moodState: computeMoodState(h.lastWorkoutAt),
    powerScore: computePowerScore(h.level, h.rarity, h.battleWins),
    stepsToEvolution: computeStepsToEvolution(h.xp, h.evolutionStage),
    createdAt: h.createdAt.toISOString(),
    lastWorkoutAt: h.lastWorkoutAt?.toISOString() ?? null,
  })));
});

router.get("/hatchlings/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = GetHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const raw = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!raw) { res.status(404).json({ error: "Hatchling not found" }); return; }
  if (raw.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const hatchling = await applyPassiveDecay(raw);
  res.json({
    ...hatchling,
    moodState: computeMoodState(hatchling.lastWorkoutAt),
    powerScore: computePowerScore(hatchling.level, hatchling.rarity, hatchling.battleWins),
    stepsToEvolution: computeStepsToEvolution(hatchling.xp, hatchling.evolutionStage),
    createdAt: hatchling.createdAt.toISOString(),
    lastWorkoutAt: hatchling.lastWorkoutAt?.toISOString() ?? null,
  });
});

router.patch("/hatchlings/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = UpdateHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateHatchlingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  type HatchlingPatch = {
    name?: string; mood?: string; happiness?: number; hunger?: number;
    energy?: number; moodState?: string; friendshipLevel?: number; lastWorkoutAt?: Date | null;
  };

  const current = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!current) { res.status(404).json({ error: "Hatchling not found" }); return; }
  if (current.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { lastWorkoutAt: lastWorkoutAtStr, ...restBody } = body.data;
  const updateData: HatchlingPatch = { ...restBody };

  // If a workout is being logged (lastWorkoutAt sent), auto-increment friendship, loyalty and set mood
  if (body.data.lastWorkoutAt) {
    if (current) {
      updateData.friendshipLevel = Math.min(100, current.friendshipLevel + 5);
      updateData.moodState = "celebrating";
      updateData.lastWorkoutAt = new Date(body.data.lastWorkoutAt);
      // Loyalty grows with each workout; motivation resets toward 100
      (updateData as Record<string, unknown>).loyaltyScore = Math.min(100, (current.loyaltyScore ?? 50) + 3);
      (updateData as Record<string, unknown>).motivationScore = Math.min(100, (current.motivationScore ?? 50) + 10);
    }
  }

  const updated = await db.update(hatchlingsTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updateData as any)
    .where(eq(hatchlingsTable.id, params.data.id))
    .returning();
  if (!updated.length) { res.status(404).json({ error: "Hatchling not found" }); return; }
  res.json({
    ...updated[0],
    moodState: computeMoodState(updated[0].lastWorkoutAt),
    powerScore: computePowerScore(updated[0].level, updated[0].rarity, updated[0].battleWins),
    stepsToEvolution: computeStepsToEvolution(updated[0].xp, updated[0].evolutionStage),
    createdAt: updated[0].createdAt.toISOString(),
    lastWorkoutAt: updated[0].lastWorkoutAt?.toISOString() ?? null,
  });
});

router.delete("/hatchlings/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = DeleteHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!hatchling) { res.status(404).json({ error: "Hatchling not found" }); return; }
  if (hatchling.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  // Clear the player's active partner pointer if it referenced this hatchling
  // so we don't leave a dangling FK that the nutrition buff resolver would skip.
  await db.update(playersTable)
    .set({ activeHatchlingId: null })
    .where(and(eq(playersTable.id, hatchling.playerId), eq(playersTable.activeHatchlingId, params.data.id)));
  await db.delete(hatchlingsTable).where(eq(hatchlingsTable.id, params.data.id));
  res.status(204).send();
});

router.post("/hatchlings/:id/evolve", requireAuth, attachPlayer, async (req, res) => {
  const params = EvolveHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = EvolveHatchlingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!hatchling) { res.status(404).json({ error: "Hatchling not found" }); return; }
  if (hatchling.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const evolutionType = await db.query.evolutionTypesTable.findFirst({ where: eq(evolutionTypesTable.id, body.data.triggerId) });
  if (!evolutionType) { res.status(404).json({ error: "Evolution type not found" }); return; }

  const newStage = Math.min(3, hatchling.evolutionStage + 1);

  const updated = await db.update(hatchlingsTable).set({
    evolutionStage: newStage,
    evolutionType: evolutionType.name,
    category: evolutionType.category,
    realm: evolutionType.realm,
    rarity: evolutionType.rarity,
    abilityName: evolutionType.abilityName,
    abilityDesc: evolutionType.abilityDesc,
    imageUrl: evolutionType.imageUrl,
    color: evolutionType.color,
    level: hatchling.level + 2,
    xp: hatchling.xp + 500,
    moodState: "celebrating",
    lastWorkoutAt: new Date(),
  }).where(eq(hatchlingsTable.id, params.data.id)).returning();

  await db.update(evolutionTypesTable).set({ unlockedCount: evolutionType.unlockedCount + 1 }).where(eq(evolutionTypesTable.id, evolutionType.id));

  res.json({
    ...updated[0],
    moodState: "celebrating",
    powerScore: computePowerScore(updated[0].level, updated[0].rarity, updated[0].battleWins),
    stepsToEvolution: computeStepsToEvolution(updated[0].xp, updated[0].evolutionStage),
    createdAt: updated[0].createdAt.toISOString(),
    lastWorkoutAt: updated[0].lastWorkoutAt?.toISOString() ?? null,
  });
});

export default router;
