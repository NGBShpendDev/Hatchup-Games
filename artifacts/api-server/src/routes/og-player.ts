import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createPlayerOgRouter, type OgPlayerLoader } from "./og-router.ts";
import type { OgPlayerInput } from "./og-render.ts";

const playerLoader: OgPlayerLoader = async (username: string): Promise<OgPlayerInput | null> => {
  try {
    const row = await db.query.playersTable.findFirst({
      where: eq(playersTable.username, username),
    });
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      level: row.level,
      rank: row.rank,
      title: row.title,
      totalSteps: row.totalSteps,
      currentStreak: row.currentStreak,
      isVerified: row.isVerified,
    };
  } catch {
    return null;
  }
};

const router = createPlayerOgRouter(playerLoader);

export default router;
