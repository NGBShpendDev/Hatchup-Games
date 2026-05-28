import { Router } from "express";
import { db } from "@workspace/db";
import { hatchlingsTable, evolutionTypesTable, playersTable, battlesTable } from "@workspace/db";
import { eq, desc, sql, and, or, inArray } from "drizzle-orm";
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
import { buildHatchShareSvg } from "./og-render.ts";
import { renderSvgToPng } from "./og-router.ts";
import { applyHatchlingXp } from "../services/hatchlingXp.ts";

// ── Realm → emoji mapping (mirrors client-side REALM_EGG_STYLES) ──────────────
const REALM_EMOJI: Record<string, string> = {
  strength: "🔥",
  cardio:   "⚡",
  balance:  "✨",
  beast:    "🌿",
  mythic:   "🌌",
};

const router = Router();

// ── Mood state helpers ─────────────────────────────────────────────────────────
// Returns "sad" when:
//   • motivationScore has fallen below 30 (critically demotivated), OR
//   • no workout has been logged today and the local clock has passed the
//     player's personal daily-goal deadline (default 20 = 8 pm).
// "celebrating" wins over everything if the last workout was within 2 h.
function computeMoodState(
  lastWorkoutAt: Date | null,
  motivationScore: number = 50,
  deadlineHour: number = 20,
): string {
  const now = new Date();

  if (lastWorkoutAt) {
    const ms = now.getTime() - lastWorkoutAt.getTime();
    const hours = ms / (1000 * 60 * 60);
    if (hours < 2) return "celebrating";
  }

  // Critically low motivation → sad regardless of time
  if (motivationScore < 30) return "sad";

  // Past the player's personal deadline and no workout logged today → missed daily goal
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const workedOutToday = lastWorkoutAt !== null && lastWorkoutAt >= todayMidnight;
  const clampedDeadline = Math.max(0, Math.min(23, Math.floor(deadlineHour)));
  if (!workedOutToday && now.getHours() >= clampedDeadline) return "sad";

  if (!lastWorkoutAt) return "happy";
  const hoursTotal = (now.getTime() - lastWorkoutAt.getTime()) / (1000 * 60 * 60);
  if (hoursTotal > 24) return "resting";
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

// ── Streak computation ─────────────────────────────────────────────────────
// Counts consecutive wins from the most-recent battle backwards, across all
// opponents. Resets on any loss or draw. Returns 0 when no data.

function computeStreakFromBattles(
  hatchlingId: number,
  battles: Array<{ hatchling1Id: number; hatchling2Id: number | null; player1Id: number; player2Id: number | null; winnerId: number | null; createdAt: Date }>,
): number {
  // battles must already be sorted newest → oldest for this hatchling
  let streak = 0;
  for (const b of battles) {
    if (b.winnerId === null) break; // draw / ongoing → reset
    const isHatchling1 = b.hatchling1Id === hatchlingId;
    const ownerPlayerId = isHatchling1 ? b.player1Id : b.player2Id;
    if (ownerPlayerId === null) break;
    if (b.winnerId === ownerPlayerId) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

async function computeStreak(hatchlingId: number): Promise<number> {
  const battles = await db.select({
    hatchling1Id: battlesTable.hatchling1Id,
    hatchling2Id: battlesTable.hatchling2Id,
    player1Id: battlesTable.player1Id,
    player2Id: battlesTable.player2Id,
    winnerId: battlesTable.winnerId,
    createdAt: battlesTable.createdAt,
  })
    .from(battlesTable)
    .where(or(
      eq(battlesTable.hatchling1Id, hatchlingId),
      eq(battlesTable.hatchling2Id, hatchlingId),
    ))
    .orderBy(desc(battlesTable.createdAt))
    .limit(50);
  return computeStreakFromBattles(hatchlingId, battles);
}

async function computeStreakBatch(hatchlingIds: number[]): Promise<Map<number, number>> {
  if (hatchlingIds.length === 0) return new Map();
  const battles = await db.select({
    hatchling1Id: battlesTable.hatchling1Id,
    hatchling2Id: battlesTable.hatchling2Id,
    player1Id: battlesTable.player1Id,
    player2Id: battlesTable.player2Id,
    winnerId: battlesTable.winnerId,
    createdAt: battlesTable.createdAt,
  })
    .from(battlesTable)
    .where(or(
      inArray(battlesTable.hatchling1Id, hatchlingIds),
      inArray(battlesTable.hatchling2Id, hatchlingIds),
    ))
    .orderBy(desc(battlesTable.createdAt))
    .limit(500);

  // Group per hatchling in DESC order (already sorted globally DESC, so
  // appending preserves relative order within each per-hatchling list).
  const perHatchling = new Map<number, typeof battles>();
  for (const id of hatchlingIds) perHatchling.set(id, []);

  for (const b of battles) {
    if (perHatchling.has(b.hatchling1Id)) perHatchling.get(b.hatchling1Id)!.push(b);
    if (b.hatchling2Id !== null && perHatchling.has(b.hatchling2Id)) perHatchling.get(b.hatchling2Id)!.push(b);
  }

  const result = new Map<number, number>();
  for (const [id, hBattles] of perHatchling) {
    result.set(id, computeStreakFromBattles(id, hBattles));
  }
  return result;
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

  // Motivation decay: ~5 pts/hr when lastWorkoutAt > 24h.
  // Uses a separate motivationDecayAt guard so frequent reads don't churn writes
  // independently of the vitals decay cadence.
  //
  // Baseline for elapsed time is ALWAYS clamped to the 24h threshold
  // (lastWorkoutAt + GRACE) so grace-window reads never pre-accumulate time
  // that would over-penalize on the first overdue check.
  const MOTIVATION_GRACE_MS = 24 * 60 * 60 * 1000;
  const MOTIVATION_RATE_PER_HOUR = 5;
  // Skip motivation decay until the player has logged at least one workout.
  // Epoch fallback (??0) would make all never-trained pals immediately overdue.
  const thresholdMs = h.lastWorkoutAt
    ? h.lastWorkoutAt.getTime() + MOTIVATION_GRACE_MS
    : Infinity;
  const isMotivationOverdue = now.getTime() > thresholdMs;

  let newMotivation = h.motivationScore ?? 50;
  let newMotivationDecayAt: Date | null | undefined = h.motivationDecayAt;
  let motivationChanged = false;

  if (isMotivationOverdue) {
    // Clamp reference to threshold so pre-grace time is never counted.
    // If motivationDecayAt is already set (a previous overdue decay ran), use
    // whichever is later: the stored timestamp or the threshold.
    const motivDecayRef = Math.max(
      h.motivationDecayAt?.getTime() ?? thresholdMs,
      thresholdMs,
    );
    const motivElapsedMs = Math.max(0, now.getTime() - motivDecayRef);
    const motivRawDrop = (motivElapsedMs / MS_PER_HOUR) * MOTIVATION_RATE_PER_HOUR;
    if (motivRawDrop >= 1) {
      newMotivation = Math.max(0, newMotivation - Math.floor(motivRawDrop));
      newMotivationDecayAt = now;
      motivationChanged = true;
    }
  }
  // Grace window: do NOT touch motivationDecayAt — leave it null/stale so
  // the first overdue read always measures from the 24h threshold.

  if (motivationChanged) {
    await db.update(hatchlingsTable)
      .set({ happiness: newHappiness, hunger: newHunger, energy: newEnergy, lastDecayAt: now, motivationScore: newMotivation, motivationDecayAt: newMotivationDecayAt })
      .where(eq(hatchlingsTable.id, h.id));
  } else {
    await db.update(hatchlingsTable)
      .set({ happiness: newHappiness, hunger: newHunger, energy: newEnergy, lastDecayAt: now })
      .where(eq(hatchlingsTable.id, h.id));
  }

  return { ...h, happiness: newHappiness, hunger: newHunger, energy: newEnergy, motivationScore: newMotivation, motivationDecayAt: newMotivationDecayAt ?? null, lastDecayAt: now };
}

router.get("/hatchlings", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const query = ListHatchlingsQueryParams.safeParse({ playerId: req.query.playerId ? Number(req.query.playerId) : undefined, limit: req.query.limit ? Number(req.query.limit) : 20 });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  // Fetch player goals so computeMoodState uses personal thresholds.
  const playerGoals = req.playerId
    ? await db.query.playersTable.findFirst({
        where: eq(playersTable.id, req.playerId),
        columns: { dailyWorkoutDeadlineHour: true },
      })
    : null;
  const deadlineHour = playerGoals?.dailyWorkoutDeadlineHour ?? 20;

  const rawResults = await db.query.hatchlingsTable.findMany({
    where: query.data.playerId ? eq(hatchlingsTable.playerId, query.data.playerId) : undefined,
    limit: query.data.limit ?? 20,
    orderBy: [desc(hatchlingsTable.createdAt)],
  });
  const results = await Promise.all(rawResults.map(applyPassiveDecay));
  const hatchlingIds = results.map(h => h.id);
  const streaks = await computeStreakBatch(hatchlingIds);
  res.json(results.map(h => {
    const streak = streaks.get(h.id) ?? 0;
    return {
      ...h,
      moodState: computeMoodState(h.lastWorkoutAt, h.motivationScore, deadlineHour),
      powerScore: computePowerScore(h.level, h.rarity, h.battleWins),
      stepsToEvolution: computeStepsToEvolution(h.xp, h.evolutionStage),
      streakCount: streak >= 2 ? streak : null,
      createdAt: h.createdAt.toISOString(),
      lastWorkoutAt: h.lastWorkoutAt?.toISOString() ?? null,
    };
  }));
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
  const hatchlingIds = results.map(h => h.id);
  const streaks = await computeStreakBatch(hatchlingIds);
  res.json(results.map(h => {
    const streak = streaks.get(h.id) ?? 0;
    return {
      ...h,
      moodState: computeMoodState(h.lastWorkoutAt, h.motivationScore),
      powerScore: computePowerScore(h.level, h.rarity, h.battleWins),
      stepsToEvolution: computeStepsToEvolution(h.xp, h.evolutionStage),
      streakCount: streak >= 2 ? streak : null,
      createdAt: h.createdAt.toISOString(),
      lastWorkoutAt: h.lastWorkoutAt?.toISOString() ?? null,
    };
  }));
});

// ── GET /hatchlings/:id/share-image — public PNG share card ───────────────────
// No auth required: this is the sharable image link. The endpoint is intentionally
// public so share targets (Twitter, iMessage, etc.) can unfurl the card without
// a session cookie.
router.get("/hatchlings/:id/share-image", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid hatchling id" });
    return;
  }

  // Optional steps override from query (e.g. ?steps=12345). Defaults to the
  // player's stored total steps if available, otherwise 0.
  const stepsParam = req.query.steps !== undefined ? Number(req.query.steps) : undefined;

  try {
    const hatchling = await db.query.hatchlingsTable.findFirst({
      where: eq(hatchlingsTable.id, id),
    });
    if (!hatchling) {
      res.status(404).json({ error: "Hatchling not found" });
      return;
    }

    // Resolve step count: prefer query param, else look up from player row.
    let steps = 0;
    if (stepsParam != null && Number.isFinite(stepsParam) && stepsParam >= 0) {
      steps = Math.floor(stepsParam);
    } else {
      try {
        const player = await db.query.playersTable.findFirst({
          where: eq(playersTable.id, hatchling.playerId),
        });
        steps = player?.totalSteps ?? 0;
      } catch {
        // best-effort — leave steps as 0 if lookup fails
      }
    }

    const realmEmoji = REALM_EMOJI[hatchling.realm ?? "balance"] ?? "✨";
    const rarity = hatchling.rarity ?? "Common";

    const svg = buildHatchShareSvg({
      name: hatchling.name,
      species: hatchling.species ?? "Mystery Pal",
      rarity,
      realmEmoji,
      steps,
      level: hatchling.level,
    });

    const png = await renderSvgToPng(svg);

    res.setHeader("Content-Type", "image/png");
    // Cache for 1 hour — short enough to reflect renames, long enough to be CDN-friendly.
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.send(png);
  } catch (err) {
    req.log?.warn({ err: (err as Error).message, hatchlingId: id }, "hatchling share-image render failed");
    res.status(500).json({ error: "Failed to render share image" });
  }
});

router.get("/hatchlings/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = GetHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const raw = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!raw) { res.status(404).json({ error: "Hatchling not found" }); return; }
  if (raw.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const [hatchling, playerGoals] = await Promise.all([
    applyPassiveDecay(raw),
    req.playerId
      ? db.query.playersTable.findFirst({
          where: eq(playersTable.id, req.playerId),
          columns: { dailyWorkoutDeadlineHour: true, dailyStepGoal: true },
        })
      : Promise.resolve(null),
  ]);
  const deadlineHour = playerGoals?.dailyWorkoutDeadlineHour ?? 20;
  const streak = await computeStreak(hatchling.id);
  res.json({
    ...hatchling,
    moodState: computeMoodState(hatchling.lastWorkoutAt, hatchling.motivationScore, deadlineHour),
    powerScore: computePowerScore(hatchling.level, hatchling.rarity, hatchling.battleWins),
    stepsToEvolution: computeStepsToEvolution(hatchling.xp, hatchling.evolutionStage),
    streakCount: streak >= 2 ? streak : null,
    dailyStepGoal: playerGoals?.dailyStepGoal ?? 8000,
    dailyWorkoutDeadlineHour: deadlineHour,
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

  // Whether this workout triggered a comeback (was previously sad → now recovering)
  let isComeback = false;
  let comebackStreakBonus = false;

  // If a workout is being logged (lastWorkoutAt sent), auto-increment friendship, loyalty and set mood
  if (body.data.lastWorkoutAt) {
    if (current) {
      updateData.friendshipLevel = Math.min(100, current.friendshipLevel + 5);
      updateData.moodState = "celebrating";
      updateData.lastWorkoutAt = new Date(body.data.lastWorkoutAt);
      // Loyalty grows with each workout; motivation resets toward 100
      (updateData as Record<string, unknown>).loyaltyScore = Math.min(100, (current.loyaltyScore ?? 50) + 3);
      (updateData as Record<string, unknown>).motivationScore = Math.min(100, (current.motivationScore ?? 50) + 10);
      // Reset the motivation decay clock so the 24h grace window starts fresh
      (updateData as Record<string, unknown>).motivationDecayAt = new Date();

      // Detect comeback: was the hatchling in a sad mood state before this workout?
      const prevMoodState = computeMoodState(current.lastWorkoutAt, current.motivationScore ?? 50);
      if (prevMoodState === "sad") {
        isComeback = true;
        const newComebackStreak = (current.comebackStreak ?? 0) + 1;
        (updateData as Record<string, unknown>).comebackStreak = newComebackStreak;

        // Every 3rd consecutive comeback earns a milestone bonus: +50 XP, +5 extra loyalty
        if (newComebackStreak % 3 === 0) {
          comebackStreakBonus = true;
          const bonusXp = 50;
          const bonusLoyalty = 5;
          (updateData as Record<string, unknown>).xp = Math.min(9999, (current.xp ?? 0) + bonusXp);
          (updateData as Record<string, unknown>).loyaltyScore = Math.min(100, (current.loyaltyScore ?? 50) + 3 + bonusLoyalty);
        }
      }
    }
  }

  const [updatedRows, playerGoalsPatch] = await Promise.all([
    db.update(hatchlingsTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updateData as any)
      .where(eq(hatchlingsTable.id, params.data.id))
      .returning(),
    req.playerId
      ? db.query.playersTable.findFirst({
          where: eq(playersTable.id, req.playerId),
          columns: { dailyWorkoutDeadlineHour: true, dailyStepGoal: true },
        })
      : Promise.resolve(null),
  ]);
  if (!updatedRows.length) { res.status(404).json({ error: "Hatchling not found" }); return; }
  const patchDeadlineHour = playerGoalsPatch?.dailyWorkoutDeadlineHour ?? 20;
  const patchStreak = await computeStreak(updatedRows[0].id);
  res.json({
    ...updatedRows[0],
    moodState: computeMoodState(updatedRows[0].lastWorkoutAt, updatedRows[0].motivationScore, patchDeadlineHour),
    powerScore: computePowerScore(updatedRows[0].level, updatedRows[0].rarity, updatedRows[0].battleWins),
    stepsToEvolution: computeStepsToEvolution(updatedRows[0].xp, updatedRows[0].evolutionStage),
    streakCount: patchStreak >= 2 ? patchStreak : null,
    dailyStepGoal: playerGoalsPatch?.dailyStepGoal ?? 8000,
    dailyWorkoutDeadlineHour: patchDeadlineHour,
    createdAt: updatedRows[0].createdAt.toISOString(),
    lastWorkoutAt: updatedRows[0].lastWorkoutAt?.toISOString() ?? null,
    // Comeback streak metadata — frontend uses these to trigger "Unstoppable!" toast
    isComeback,
    comebackStreakBonus,
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

  await db.update(hatchlingsTable).set({
    evolutionStage: newStage,
    evolutionType: evolutionType.name,
    category: evolutionType.category,
    realm: evolutionType.realm,
    rarity: evolutionType.rarity,
    abilityName: evolutionType.abilityName,
    abilityDesc: evolutionType.abilityDesc,
    imageUrl: evolutionType.imageUrl,
    color: evolutionType.color,
    moodState: "celebrating",
    lastWorkoutAt: new Date(),
  }).where(eq(hatchlingsTable.id, params.data.id));

  await applyHatchlingXp(params.data.id, 500);

  await db.update(evolutionTypesTable).set({ unlockedCount: evolutionType.unlockedCount + 1 }).where(eq(evolutionTypesTable.id, evolutionType.id));

  const evolved = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!evolved) { res.status(404).json({ error: "Hatchling not found after evolve" }); return; }

  const evolveStreak = await computeStreak(evolved.id);
  res.json({
    ...evolved,
    moodState: "celebrating",
    powerScore: computePowerScore(evolved.level, evolved.rarity, evolved.battleWins),
    stepsToEvolution: computeStepsToEvolution(evolved.xp, evolved.evolutionStage),
    streakCount: evolveStreak >= 2 ? evolveStreak : null,
    createdAt: evolved.createdAt.toISOString(),
    lastWorkoutAt: evolved.lastWorkoutAt?.toISOString() ?? null,
    evolutionSharePrompt: true,
  });
});

export default router;
