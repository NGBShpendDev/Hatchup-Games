import { Router } from "express";
import { db } from "@workspace/db";
import {
  mealPostsTable,
  mealLikesTable,
  mealCommentsTable,
  nutritionChallengeProgressTable,
  playersTable,
  groupMembersTable,
  hatchlingsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { awardBadge } from "../services/badgeService";
import { getHiddenPlayerIds } from "./safety";
import { verifyUploadToken } from "./storage";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

const router = Router();

// ── Challenge definitions ─────────────────────────────────────────────────────
const NUTRITION_CHALLENGES = [
  {
    key: "protein_streak_7",
    name: "7-Day Protein Streak",
    description: "Log 150g+ protein 7 days in a row",
    target: 7,
    unit: "days",
    xpReward: 1200,
    coinsReward: 600,
    badge: "LEAN_MACHINE",
    icon: "🥩",
  },
  {
    key: "hydration_hero",
    name: "Hydration Hero",
    description: "Log 8 cups of water per day for 5 days",
    target: 5,
    unit: "days",
    xpReward: 350,
    coinsReward: 175,
    badge: "HYDRATION_HERO",
    icon: "💧",
  },
  {
    key: "meal_prep_week",
    name: "Meal Prep Week",
    description: "Post 5 home-cooked meals in a week",
    target: 5,
    unit: "meals",
    xpReward: 1000,
    coinsReward: 500,
    badge: "MEAL_PREP_LEGEND",
    icon: "🍱",
  },
];

const MACRO_GOAL_TARGETS: Record<string, { calories: number; protein: number; carbs: number; fat: number; tip: string }> = {
  shredded:         { calories: 1700, protein: 180, carbs: 130, fat: 50,  tip: "High protein, low carb — protect muscle while burning fat." },
  lean_athlete:     { calories: 2200, protein: 170, carbs: 230, fat: 65,  tip: "Balanced macros — fuel performance and stay lean." },
  muscle_gain:      { calories: 2800, protein: 200, carbs: 300, fat: 80,  tip: "Caloric surplus with high protein — eat to grow." },
  slim_thick:       { calories: 1900, protein: 150, carbs: 190, fat: 60,  tip: "Moderate deficit with resistance training macros." },
  endurance_runner: { calories: 2500, protein: 140, carbs: 330, fat: 70,  tip: "Carb-forward fueling — glycogen is your engine." },
  weight_loss:      { calories: 1500, protein: 140, carbs: 120, fat: 45,  tip: "Aggressive deficit — keep protein high to preserve muscle." },
};

// ── POST /nutrition/posts ─────────────────────────────────────────────────────
const CreateMealPostBody = z.object({
  playerId: z.number(),
  name: z.string().min(1).max(100),
  emoji: z.string().optional(),
  tag: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().regex(/^\/objects\//, "imageUrl must be an /objects/ path").max(500).optional(),
  uploadToken: z.string().min(1).max(256).optional(),
  calories: z.number().optional(),
  proteinG: z.number().optional(),
  carbsG: z.number().optional(),
  fatG: z.number().optional(),
  aiAnalyzed: z.boolean().optional(),
  qualityScore: z.number().int().min(1).max(10).optional(),
});

// ── Hatchling stat buffs from nutrition ───────────────────────────────────────
// Closes the core loop: meal quality → creature health.
// - quality >= 7 → +5 happiness, +5 energy (good fuel)
// - quality <= 4 → -3 happiness (junk food)
// - 5/6 → neutral
// The "active" Hatchling is the most recently interacted (lastWorkoutAt desc,
// then most-recently created) so feeding rewards the creature the player cares about.
function statDeltaForQuality(qualityScore: number): { happiness: number; energy: number } | null {
  if (qualityScore >= 7) return { happiness: 5, energy: 5 };
  if (qualityScore <= 4) return { happiness: -3, energy: 0 };
  return null;
}

async function applyNutritionStatBuff(playerId: number, qualityScore: number) {
  const delta = statDeltaForQuality(qualityScore);
  if (!delta) return null;

  // NULLS LAST so a hatchling that was never worked out isn't preferred over
  // one the player just trained with. createdAt is the secondary tiebreaker.
  const active = await db.query.hatchlingsTable.findFirst({
    where: eq(hatchlingsTable.playerId, playerId),
    orderBy: [sql`${hatchlingsTable.lastWorkoutAt} DESC NULLS LAST`, desc(hatchlingsTable.createdAt)],
  });
  if (!active) return null;

  const newHappiness = Math.max(0, Math.min(100, active.happiness + delta.happiness));
  const newEnergy    = Math.max(0, Math.min(100, active.energy    + delta.energy));

  // High-quality meals also extend a 24h "well-fed" buff that halves the
  // passive decay rate (read by applyPassiveDecay in hatchlings.ts). This
  // is the "buffs slow the decay rate for the day" part of the loop.
  const buffPatch: { happiness: number; energy: number; nutritionBuffExpiresAt?: Date } =
    { happiness: newHappiness, energy: newEnergy };
  if (qualityScore >= 7) {
    buffPatch.nutritionBuffExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  await db.update(hatchlingsTable)
    .set(buffPatch)
    .where(eq(hatchlingsTable.id, active.id));

  return {
    hatchlingId: active.id,
    hatchlingName: active.name,
    happinessDelta: newHappiness - active.happiness,
    energyDelta: newEnergy - active.energy,
    happiness: newHappiness,
    energy: newEnergy,
    buffActive: qualityScore >= 7,
  };
}

// Server-side quality scoring from macros — used as a trusted fallback when
// the client doesn't supply a score (or to validate when it does). Avoids
// trusting a spoofable client field as the only source of stat buffs.
// Heuristic: protein density and balanced macros score higher; very high
// fat-only or empty submissions score lower. Returns null when there isn't
// enough macro data to score.
function deriveQualityScoreFromMacros(
  calories: number | undefined,
  proteinG: number | undefined,
  carbsG: number | undefined,
  fatG: number | undefined,
): number | null {
  if (calories == null || calories <= 0) return null;
  if (proteinG == null && carbsG == null && fatG == null) return null;
  const p = proteinG ?? 0;
  const c = carbsG   ?? 0;
  const f = fatG     ?? 0;
  // Protein-per-100kcal — strong driver of "quality" in this app's framing.
  const proteinDensity = (p * 100) / calories; // ~10 is great, ~2 is poor
  // Fat ratio — penalize >50% calories from fat.
  const fatCalRatio = (f * 9) / calories;
  let score = 5;
  if (proteinDensity >= 8) score += 3;
  else if (proteinDensity >= 5) score += 2;
  else if (proteinDensity >= 3) score += 1;
  else if (proteinDensity < 1.5) score -= 2;
  if (fatCalRatio > 0.55) score -= 2;
  else if (fatCalRatio > 0.45) score -= 1;
  if (calories > 1200) score -= 1; // single-meal megacaloric drag
  return Math.max(1, Math.min(10, Math.round(score)));
}

router.post("/nutrition/posts", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = CreateMealPostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { playerId, name, emoji, tag, description, imageUrl, uploadToken, calories, proteinG, carbsG, fatG, aiAnalyzed, qualityScore } = body.data;

  // If an image is attached, verify the requesting user actually uploaded it
  // (HMAC token issued when the presigned URL was generated) and mark the
  // object's ACL as publicly readable so other feed viewers can fetch it.
  if (imageUrl) {
    if (!uploadToken || !verifyUploadToken(imageUrl, req.clerkUserId!, uploadToken)) {
      res.status(403).json({ error: "Invalid or missing uploadToken for imageUrl" });
      return;
    }
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(imageUrl, {
        owner: req.clerkUserId!,
        visibility: "public",
      });
    } catch (err) {
      req.log.error({ err, imageUrl }, "Failed to set ACL on uploaded meal image");
      res.status(400).json({ error: "Image upload not found or expired" });
      return;
    }
  }

  const [post] = await db.insert(mealPostsTable).values({
    playerId,
    name,
    emoji: emoji ?? "🍽️",
    tag: tag ?? "healthy-snack",
    description: description ?? null,
    imageUrl: imageUrl ?? null,
    calories: calories ?? null,
    proteinG: proteinG ?? null,
    carbsG: carbsG ?? null,
    fatG: fatG ?? null,
    aiAnalyzed: aiAnalyzed ?? false,
  }).returning();

  // Badge checks
  const newBadges: string[] = [];

  // Macro Master: check if this player has 10+ posts with full macros
  if (proteinG != null && carbsG != null && fatG != null) {
    const macroPostCount = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM meal_posts WHERE player_id = ${playerId} AND protein_g IS NOT NULL AND carbs_g IS NOT NULL AND fat_g IS NOT NULL`
    );
    const cnt = Number((macroPostCount.rows[0] as any)?.cnt ?? 0);
    if (cnt >= 10) {
      const b = await awardBadge(playerId, "MACRO_MASTER");
      if (b) newBadges.push(b.key);
    }
    // Protein King: 150g protein
    if (proteinG >= 150) {
      const b = await awardBadge(playerId, "PROTEIN_KING");
      if (b) newBadges.push(b.key);
    }
  }

  // Bulk Beast: 10+ high-protein or lean-bulk posts
  if (tag === "high-protein" || tag === "lean-bulk") {
    const bulkPostCount = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM meal_posts WHERE player_id = ${playerId} AND (tag = 'high-protein' OR tag = 'lean-bulk')`
    );
    const cnt = Number((bulkPostCount.rows[0] as any)?.cnt ?? 0);
    if (cnt >= 10) {
      const b = await awardBadge(playerId, "BULK_BEAST");
      if (b) newBadges.push(b.key);
    }
  }

  // Apply meal-quality buff/debuff to the player's active Hatchling.
  // This closes the nutrition → creature health loop.
  // Trust order: server-derived score from macros > client-supplied qualityScore.
  // If the client sends a score but it disagrees significantly with what the
  // macros suggest, fall back to the server-derived value — prevents users
  // from spamming "10/10" with a 200-cal salad and farming buffs.
  let hatchlingStatChange: Awaited<ReturnType<typeof applyNutritionStatBuff>> = null;
  const derived = deriveQualityScoreFromMacros(calories, proteinG, carbsG, fatG);
  let effectiveScore: number | null = null;
  if (derived != null && qualityScore != null) {
    effectiveScore = Math.abs(derived - qualityScore) > 3 ? derived : qualityScore;
  } else {
    effectiveScore = derived ?? qualityScore ?? null;
  }
  if (effectiveScore != null) {
    hatchlingStatChange = await applyNutritionStatBuff(playerId, effectiveScore);
  }

  res.status(201).json({
    ...post,
    createdAt: post!.createdAt.toISOString(),
    newBadges,
    hatchlingStatChange,
  });
});

// ── GET /nutrition/posts ──────────────────────────────────────────────────────
router.get("/nutrition/posts", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!; // bind to authenticated player, ignore client-supplied query
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const mode = (req.query.mode as string) ?? "feed";

  // Block filtering: drop posts from anyone the viewer blocked or who blocked viewer
  const hiddenIds = await getHiddenPlayerIds(playerId);

  // Feed = posts from people the user follows (via group co-membership as the
  //   social-follow proxy in this app) + own posts. If the user has no
  //   follow connections yet, automatically fall back to the global Discover
  //   feed so the tab is never empty for new users.
  // Discover = global, sorted by likes.
  let visiblePlayerIds: number[] | null = null;
  let fellBackToDiscover = false;
  if (mode === "feed") {
    const myGroups = await db.select({ gid: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.playerId, playerId));
    if (myGroups.length > 0) {
      const sameGroupMembers = await db.select({ pid: groupMembersTable.playerId })
        .from(groupMembersTable)
        .where(inArray(groupMembersTable.groupId, myGroups.map(g => g.gid)));
      const followIds = new Set([playerId, ...sameGroupMembers.map(m => m.pid)]);
      if (followIds.size > 1) {
        visiblePlayerIds = [...followIds];
      } else {
        // Only own posts would show → fall back to discover
        fellBackToDiscover = true;
      }
    } else {
      fellBackToDiscover = true;
    }
  }
  const effectiveMode = fellBackToDiscover ? "discover" : mode;

  const whereClauses = [
    hiddenIds.length > 0 ? notInArray(mealPostsTable.playerId, hiddenIds) : undefined,
    visiblePlayerIds      ? inArray(mealPostsTable.playerId, visiblePlayerIds) : undefined,
  ].filter(Boolean) as any[];

  const posts = await db.query.mealPostsTable.findMany({
    where: whereClauses.length > 0 ? and(...whereClauses) : undefined,
    orderBy: effectiveMode === "discover"
      ? [desc(mealPostsTable.likesCount), desc(mealPostsTable.createdAt)]
      : [desc(mealPostsTable.createdAt)],
    limit,
  });

  // Attach liked flag for the requesting player
  const likes = await db.query.mealLikesTable.findMany({
    where: eq(mealLikesTable.playerId, playerId),
  });
  const likedSet = new Set(likes.map(l => l.mealPostId));

  // Fetch display names for authors
  const playerIds = [...new Set(posts.map(p => p.playerId))];
  const players = playerIds.length
    ? await db.query.playersTable.findMany({
        where: (t, { inArray }) => inArray(t.id, playerIds),
      })
    : [];
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

  res.json({
    mode: effectiveMode,
    fellBackToDiscover,
    posts: posts.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      liked: likedSet.has(p.id),
      author: playerMap[p.playerId]
        ? { id: p.playerId, username: playerMap[p.playerId]!.username, displayName: playerMap[p.playerId]!.displayName }
        : { id: p.playerId, username: "user", displayName: null },
    })),
  });
});

// ── POST /nutrition/posts/:id/like ────────────────────────────────────────────
// Concurrency-safe toggle: only decrement/increment when the row actually
// changed in this request (use .returning() on insert/delete to confirm a
// real state change, preventing counter drift from duplicate clicks).
router.post("/nutrition/posts/:id/like", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!; // derived server-side from auth token

  const existing = await db.query.mealLikesTable.findFirst({
    where: and(eq(mealLikesTable.mealPostId, postId), eq(mealLikesTable.playerId, playerId)),
  });

  let liked: boolean;
  if (existing) {
    const deleted = await db.delete(mealLikesTable)
      .where(and(eq(mealLikesTable.mealPostId, postId), eq(mealLikesTable.playerId, playerId)))
      .returning({ id: mealLikesTable.id });
    if (deleted.length > 0) {
      // Conditional decrement: never go below 0
      await db.update(mealPostsTable)
        .set({ likesCount: sql`GREATEST(0, ${mealPostsTable.likesCount} - 1)` })
        .where(eq(mealPostsTable.id, postId));
    }
    liked = false;
  } else {
    const inserted = await db.insert(mealLikesTable)
      .values({ mealPostId: postId, playerId })
      .onConflictDoNothing()
      .returning({ id: mealLikesTable.id });
    if (inserted.length > 0) {
      await db.update(mealPostsTable)
        .set({ likesCount: sql`${mealPostsTable.likesCount} + 1` })
        .where(eq(mealPostsTable.id, postId));
    }
    liked = true;
  }

  const post = await db.query.mealPostsTable.findFirst({ where: eq(mealPostsTable.id, postId) });
  res.json({ liked, likesCount: post?.likesCount ?? 0 });
});

// ── GET /nutrition/posts/:id/comments ─────────────────────────────────────────
router.get("/nutrition/posts/:id/comments", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const viewerId = req.playerId!;
  const hiddenIds = await getHiddenPlayerIds(viewerId);

  const where = hiddenIds.length > 0
    ? and(eq(mealCommentsTable.mealPostId, postId), notInArray(mealCommentsTable.playerId, hiddenIds))
    : eq(mealCommentsTable.mealPostId, postId);

  const comments = await db.query.mealCommentsTable.findMany({
    where,
    orderBy: [desc(mealCommentsTable.createdAt)],
  });

  const playerIds = [...new Set(comments.map(c => c.playerId))];
  const players = playerIds.length
    ? await db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, playerIds) })
    : [];
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

  res.json(comments.map(c => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    author: playerMap[c.playerId]
      ? { username: playerMap[c.playerId]!.username, displayName: playerMap[c.playerId]!.displayName }
      : { username: "user", displayName: null },
  })));
});

// ── POST /nutrition/posts/:id/comments ────────────────────────────────────────
const AddCommentBody = z.object({ content: z.string().min(1).max(500) });

router.post("/nutrition/posts/:id/comments", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!; // derived server-side from auth token
  const body = AddCommentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [comment] = await db.insert(mealCommentsTable).values({
    mealPostId: postId,
    playerId,
    content: body.data.content,
  }).returning();

  await db.update(mealPostsTable).set({ commentsCount: sql`comments_count + 1` }).where(eq(mealPostsTable.id, postId));

  res.status(201).json({ ...comment, createdAt: comment!.createdAt.toISOString() });
});

// ── POST /nutrition/analyze ───────────────────────────────────────────────────
const AnalyzeBody = z.object({ description: z.string().min(3).max(500) });

router.post("/nutrition/analyze", requireAuth, attachPlayer, async (req, res) => {
  const body = AnalyzeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "description required" }); return; }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are a sports nutritionist. Given a meal description, return ONLY valid JSON with these fields: calories (number), protein_g (number), carbs_g (number), fat_g (number), quality_score (1-10 integer), suggestions (array of 1-3 short strings). No markdown, no extra text.`,
        },
        { role: "user", content: body.data.description },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { calories: 400, protein_g: 25, carbs_g: 40, fat_g: 15, quality_score: 6, suggestions: ["Estimate only — try a more detailed description."] };
    }

    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "AI analyze error");
    res.status(503).json({ error: "AI service unavailable" });
  }
});

// ── GET /nutrition/challenges ─────────────────────────────────────────────────
router.get("/nutrition/challenges", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!; // bind to authenticated player

  const progress = await db.query.nutritionChallengeProgressTable.findMany({
    where: eq(nutritionChallengeProgressTable.playerId, playerId),
  });

  const progressMap = Object.fromEntries(progress.map(p => [p.challengeKey, p]));

  res.json(NUTRITION_CHALLENGES.map(c => ({
    ...c,
    currentValue: progressMap[c.key]?.currentValue ?? 0,
    completedAt: progressMap[c.key]?.completedAt?.toISOString() ?? null,
  })));
});

// ── POST /nutrition/challenges/:key/progress ──────────────────────────────────
const ChallengeProgressBody = z.object({ playerId: z.number(), increment: z.number().default(1) });

router.post("/nutrition/challenges/:key/progress", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const key = String(req.params.key);
  const body = ChallengeProgressBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const challenge = NUTRITION_CHALLENGES.find(c => c.key === key);
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  const { playerId, increment } = body.data;

  const existing = await db.query.nutritionChallengeProgressTable.findFirst({
    where: and(
      eq(nutritionChallengeProgressTable.playerId, playerId),
      eq(nutritionChallengeProgressTable.challengeKey, key),
    ),
  });

  const alreadyComplete = existing?.completedAt != null;
  if (alreadyComplete) {
    res.json({ alreadyCompleted: true, currentValue: existing!.currentValue, target: challenge.target });
    return;
  }

  const newValue = (existing?.currentValue ?? 0) + increment;
  const isComplete = newValue >= challenge.target;

  if (existing) {
    await db.update(nutritionChallengeProgressTable)
      .set({
        currentValue: newValue,
        completedAt: isComplete ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(nutritionChallengeProgressTable.playerId, playerId),
        eq(nutritionChallengeProgressTable.challengeKey, key),
      ));
  } else {
    await db.insert(nutritionChallengeProgressTable).values({
      playerId,
      challengeKey: key,
      currentValue: newValue,
      completedAt: isComplete ? new Date() : null,
    });
  }

  let newBadge: string | null = null;
  if (isComplete && challenge.badge) {
    // Award XP + coins
    await db.update(playersTable)
      .set({
        xp: sql`xp + ${challenge.xpReward}`,
        coins: sql`coins + ${challenge.coinsReward}`,
      })
      .where(eq(playersTable.id, playerId));
    const b = await awardBadge(playerId, challenge.badge);
    if (b) newBadge = b.key;
  }

  res.json({ currentValue: newValue, target: challenge.target, isComplete, newBadge });
});

// ── GET /nutrition/macro-target ───────────────────────────────────────────────
// AI-derived macro targets based on physique goal + fitness profile, with static fallback.
router.get("/nutrition/macro-target", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!; // bind to authenticated player

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const goal = player.physiqueGoal ?? "lean_athlete";
  const fallback = MACRO_GOAL_TARGETS[goal] ?? MACRO_GOAL_TARGETS["lean_athlete"]!;

  // Try AI-personalized macros using available fitness profile signals
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 250,
      messages: [
        {
          role: "system",
          content: `You are a sports nutritionist. Given a player's physique goal and fitness profile, return ONLY valid JSON with keys: calories (number), protein (g, number), carbs (g, number), fat (g, number), tip (short string under 80 chars). No markdown.`,
        },
        {
          role: "user",
          content: `Goal: ${goal}. Player level ${player.level}, fitness XP ${player.fitnessXp}, total XP ${player.xp}. Provide realistic daily macro targets.`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { calories?: number; protein?: number; carbs?: number; fat?: number; tip?: string };
    if (parsed.calories && parsed.protein && parsed.carbs && parsed.fat) {
      res.json({
        goal,
        calories: parsed.calories,
        protein: parsed.protein,
        carbs: parsed.carbs,
        fat: parsed.fat,
        tip: parsed.tip ?? fallback.tip,
        aiPersonalized: true,
      });
      return;
    }
  } catch (err) {
    req.log.warn({ err }, "AI macro target failed; using static fallback");
  }

  res.json({ goal, ...fallback, aiPersonalized: false });
});

// ── PUT /nutrition/physique-goal ──────────────────────────────────────────────
const PhysiqueGoalBody = z.object({ playerId: z.number(), physiqueGoal: z.string() });

router.put("/nutrition/physique-goal", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = PhysiqueGoalBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  await db.update(playersTable)
    .set({ physiqueGoal: body.data.physiqueGoal })
    .where(eq(playersTable.id, body.data.playerId));

  res.json({ physiqueGoal: body.data.physiqueGoal });
});

export default router;
