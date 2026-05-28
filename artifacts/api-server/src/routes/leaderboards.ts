import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable } from "@workspace/db";
import { desc, eq, notInArray } from "drizzle-orm";
import { GetGlobalLeaderboardQueryParams, GetModeLeaderboardQueryParams } from "@workspace/api-zod";
import { getHiddenPlayerIds } from "./safety";
import { requireAuth, attachPlayer } from "../middlewares/auth";

const router = Router();

const RANK_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Diamond: "#B9F2FF",
  Master: "#9B59B6",
  Cosmic: "#00FFFF",
  Legendary: "#FF6B35",
};

// Block filtering is derived from authenticated session — never trust client-supplied viewerId.
router.get("/leaderboards/global", requireAuth, attachPlayer, async (req, res) => {
  const query = GetGlobalLeaderboardQueryParams.safeParse({ limit: req.query.limit ? Number(req.query.limit) : 50 });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  const players = hiddenIds.length > 0
    ? await db.select().from(playersTable).where(notInArray(playersTable.id, hiddenIds)).orderBy(desc(playersTable.rankScore), desc(playersTable.totalWins)).limit(query.data.limit ?? 50)
    : await db.select().from(playersTable).orderBy(desc(playersTable.rankScore), desc(playersTable.totalWins)).limit(query.data.limit ?? 50);

  const hatchlings = await db.query.hatchlingsTable.findMany();

  const result = players.map((p, i) => {
    const topHatchling = hatchlings.filter(h => h.playerId === p.id).sort((a, b) => b.level - a.level)[0];
    return {
      position: i + 1,
      playerId: p.id,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      rank: p.rank,
      score: p.rankScore,
      wins: p.totalWins,
      hatchlingName: topHatchling?.name ?? "None",
      hatchlingCategory: topHatchling?.category ?? null,
    };
  });

  res.json(result);
});

router.get("/leaderboards/by-mode", requireAuth, attachPlayer, async (req, res) => {
  const query = GetModeLeaderboardQueryParams.safeParse({ mode: req.query.mode as string, limit: req.query.limit ? Number(req.query.limit) : 50 });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  const players = hiddenIds.length > 0
    ? await db.select().from(playersTable).where(notInArray(playersTable.id, hiddenIds)).orderBy(desc(playersTable.totalWins)).limit(query.data.limit ?? 50)
    : await db.select().from(playersTable).orderBy(desc(playersTable.totalWins)).limit(query.data.limit ?? 50);

  const hatchlings = await db.query.hatchlingsTable.findMany();

  const result = players.map((p, i) => {
    const topHatchling = hatchlings.filter(h => h.playerId === p.id).sort((a, b) => b.level - a.level)[0];
    return {
      position: i + 1,
      playerId: p.id,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      rank: p.rank,
      score: p.rankScore,
      wins: p.totalWins,
      hatchlingName: topHatchling?.name ?? "None",
      hatchlingCategory: topHatchling?.category ?? null,
    };
  });

  res.json(result);
});

router.get("/leaderboards/rank-distribution", async (req, res) => {
  const players = await db.query.playersTable.findMany();
  const rankMap: Record<string, number> = {};
  for (const p of players) {
    rankMap[p.rank] = (rankMap[p.rank] ?? 0) + 1;
  }

  const ranks = ["Bronze", "Silver", "Gold", "Diamond", "Master", "Cosmic", "Legendary"];
  const result = ranks.map(rank => ({
    rank,
    count: rankMap[rank] ?? 0,
    percentage: players.length > 0 ? ((rankMap[rank] ?? 0) / players.length) * 100 : 0,
    color: RANK_COLORS[rank] ?? "#888888",
  }));

  res.json(result);
});

export default router;
