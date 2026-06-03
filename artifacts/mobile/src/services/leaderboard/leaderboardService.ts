import {
  getUserLeaderboardStats,
  validateLeaderboardStats,
} from "../../domain/leaderboard";
import type { HatchUpData } from "../../domain/models";

export interface LeaderboardSyncResult {
  mode: "local" | "remote";
  syncedAt: string;
}

export async function syncLeaderboardEntry(
  data: HatchUpData,
  today: string,
): Promise<LeaderboardSyncResult> {
  const syncedAt = new Date().toISOString();
  if (!data.leaderboardShareEnabled) {
    return { mode: "local", syncedAt };
  }

  const apiUrl = process.env.EXPO_PUBLIC_LEADERBOARD_API_URL;
  if (!apiUrl) {
    return { mode: "local", syncedAt };
  }

  const stats = getUserLeaderboardStats(data, today);
  const validation = validateLeaderboardStats(stats);
  const response = await fetch(apiUrl, {
    body: JSON.stringify({
      alias: data.leaderboardAlias || data.monsterName || "HatchUp Tester",
      leaderboardId: data.leaderboardId,
      monsterName: data.monsterName,
      stats,
      validation,
      syncedAt,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Leaderboard sync failed with ${response.status}.`);
  }

  return { mode: "remote", syncedAt };
}
