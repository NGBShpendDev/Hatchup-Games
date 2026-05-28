import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, playerBadgesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { getDailyReward, checkAndAwardBadges } from "../services/badgeService.ts";

const router = Router();

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

/** GET /rewards/daily — check today's reward status */
router.get("/rewards/daily", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const now = new Date();
  const lastClaimed = player.lastRewardClaimedAt;
  const alreadyClaimed = lastClaimed ? isSameDay(new Date(lastClaimed), now) : false;

  // Compute streak: if claimed yesterday, streak continues; otherwise it resets
  let streak = player.dailyRewardStreak;
  if (lastClaimed && !isYesterday(new Date(lastClaimed), now) && !alreadyClaimed) {
    streak = 0; // streak broken
  }

  const nextStreak = streak + 1;
  const reward = getDailyReward(nextStreak);

  res.json({
    alreadyClaimed,
    streak,
    nextStreak,
    reward,
    lastClaimedAt: lastClaimed?.toISOString() ?? null,
  });
});

/** POST /rewards/daily/claim — claim today's daily reward */
router.post("/rewards/daily/claim", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const now = new Date();
  const lastClaimed = player.lastRewardClaimedAt;

  if (lastClaimed && isSameDay(new Date(lastClaimed), now)) {
    res.status(409).json({ error: "Already claimed today" }); return;
  }

  // Compute new streak
  let newStreak = 1;
  if (lastClaimed && isYesterday(new Date(lastClaimed), now)) {
    newStreak = player.dailyRewardStreak + 1;
  }

  const reward = getDailyReward(newStreak);

  // Award XP + coins
  await db.update(playersTable)
    .set({
      xp: sql`${playersTable.xp} + ${reward.xp}`,
      coins: sql`${playersTable.coins} + ${reward.coins}`,
      lastRewardClaimedAt: now,
      dailyRewardStreak: newStreak,
      ...(reward.bonus === "streak_freeze" ? { streakFreezes: sql`${playersTable.streakFreezes} + 1` } : {}),
    })
    .where(eq(playersTable.id, req.playerId!));

  // Check for badges
  const newBadges = await checkAndAwardBadges(req.playerId!, { dailyRewardStreak: newStreak });

  res.json({
    reward,
    newStreak,
    newBadges: newBadges.map(b => ({ key: b.key, name: b.name, tier: b.tier, icon: b.icon })),
  });
});

/** POST /players/:id/prestige — prestige (requires level 100) */
router.post("/players/:id/prestige", requireAuth, attachPlayer, async (req, res) => {
  const playerId = Number(req.params.id);
  if (playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  if (player.level < 100) { res.status(400).json({ error: "Must be level 100 to prestige" }); return; }

  const newPrestige = player.prestige + 1;
  const PRESTIGE_TITLES = ["", "Prestige I", "Prestige II", "Prestige III", "Grand Prestige", "Mythic Prestige"];
  const title = PRESTIGE_TITLES[Math.min(newPrestige, PRESTIGE_TITLES.length - 1)];

  await db.update(playersTable)
    .set({ level: 1, xp: 0, prestige: newPrestige, title, coins: sql`${playersTable.coins} + 1000` })
    .where(eq(playersTable.id, playerId));

  const newBadges = await checkAndAwardBadges(playerId, { hasPrestige: true });

  const updated = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });

  res.json({ player: updated, newBadges: newBadges.map(b => ({ key: b.key, name: b.name, tier: b.tier, icon: b.icon })) });
});

export default router;
