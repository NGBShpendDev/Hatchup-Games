import { Router } from "express";
import { db } from "@workspace/db";
import {
  mealPostsTable,
  mealLikesTable,
  mealCommentsTable,
  nutritionChallengeProgressTable,
  playersTable,
} from "@workspace/db";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { awardBadge } from "../services/badgeService";

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
  calories: z.number().optional(),
  proteinG: z.number().optional(),
  carbsG: z.number().optional(),
  fatG: z.number().optional(),
  aiAnalyzed: z.boolean().optional(),
});

router.post("/nutrition/posts", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = CreateMealPostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { playerId, name, emoji, tag, description, calories, proteinG, carbsG, fatG, aiAnalyzed } = body.data;

  const [post] = await db.insert(mealPostsTable).values({
    playerId,
    name,
    emoji: emoji ?? "🍽️",
    tag: tag ?? "healthy-snack",
    description: description ?? null,
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

  res.status(201).json({ ...post, createdAt: post!.createdAt.toISOString(), newBadges });
});

// ── GET /nutrition/posts ──────────────────────────────────────────────────────
router.get("/nutrition/posts", requireAuth, attachPlayer, async (req, res) => {
  const playerId = Number(req.query.playerId);
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const mode = (req.query.mode as string) ?? "feed";

  // feed = chronological (most recent first); discover = sorted by most liked
  const posts = await db.query.mealPostsTable.findMany({
    orderBy: mode === "discover"
      ? [desc(mealPostsTable.likesCount), desc(mealPostsTable.createdAt)]
      : [desc(mealPostsTable.createdAt)],
    limit,
  });

  // Attach liked flag for the requesting player
  let likedSet: Set<number> = new Set();
  if (playerId) {
    const likes = await db.query.mealLikesTable.findMany({
      where: eq(mealLikesTable.playerId, playerId),
    });
    likedSet = new Set(likes.map(l => l.mealPostId));
  }

  // Fetch display names for authors
  const playerIds = [...new Set(posts.map(p => p.playerId))];
  const players = playerIds.length
    ? await db.query.playersTable.findMany({
        where: (t, { inArray }) => inArray(t.id, playerIds),
      })
    : [];
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

  res.json(posts.map(p => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    liked: likedSet.has(p.id),
    author: playerMap[p.playerId]
      ? { id: p.playerId, username: playerMap[p.playerId]!.username, displayName: playerMap[p.playerId]!.displayName }
      : { id: p.playerId, username: "user", displayName: null },
  })));
});

// ── POST /nutrition/posts/:id/like ────────────────────────────────────────────
router.post("/nutrition/posts/:id/like", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!; // derived server-side from auth token

  const existing = await db.query.mealLikesTable.findFirst({
    where: and(eq(mealLikesTable.mealPostId, postId), eq(mealLikesTable.playerId, playerId)),
  });

  let liked: boolean;
  if (existing) {
    await db.delete(mealLikesTable).where(and(eq(mealLikesTable.mealPostId, postId), eq(mealLikesTable.playerId, playerId)));
    await db.update(mealPostsTable).set({ likesCount: sql`likes_count - 1` }).where(eq(mealPostsTable.id, postId));
    liked = false;
  } else {
    await db.insert(mealLikesTable).values({ mealPostId: postId, playerId }).onConflictDoNothing();
    await db.update(mealPostsTable).set({ likesCount: sql`likes_count + 1` }).where(eq(mealPostsTable.id, postId));
    liked = true;
  }

  const post = await db.query.mealPostsTable.findFirst({ where: eq(mealPostsTable.id, postId) });
  res.json({ liked, likesCount: post?.likesCount ?? 0 });
});

// ── GET /nutrition/posts/:id/comments ─────────────────────────────────────────
router.get("/nutrition/posts/:id/comments", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const comments = await db.query.mealCommentsTable.findMany({
    where: eq(mealCommentsTable.mealPostId, postId),
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
  const playerId = Number(req.query.playerId);

  const progress = playerId
    ? await db.query.nutritionChallengeProgressTable.findMany({
        where: eq(nutritionChallengeProgressTable.playerId, playerId),
      })
    : [];

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
router.get("/nutrition/macro-target", requireAuth, attachPlayer, async (req, res) => {
  const playerId = Number(req.query.playerId);
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const goal = player.physiqueGoal ?? "lean_athlete";
  const targets = MACRO_GOAL_TARGETS[goal] ?? MACRO_GOAL_TARGETS["lean_athlete"];

  res.json({ goal, ...targets! });
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
