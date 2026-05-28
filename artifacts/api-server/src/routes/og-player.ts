import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createPlayerOgRouter, type OgPlayerLoader } from "./og-router.ts";
import type { OgPlayerInput } from "./og-render.ts";
import { getEntitlement } from "../services/entitlement.ts";
import { resolveAccentColor, resolveAccentColorId } from "../services/accentColors.ts";

const playerLoader: OgPlayerLoader = async (username: string): Promise<OgPlayerInput | null> => {
  try {
    const row = await db.query.playersTable.findFirst({
      where: eq(playersTable.username, username),
    });
    if (!row) return null;
    const tier = getEntitlement(row).tier;
    const accentId = resolveAccentColorId(row.shareAccentColor, tier);
    const accent = resolveAccentColor(row.shareAccentColor, tier);
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
      accentId,
      accent,
    };
  } catch {
    return null;
  }
};

const router = createPlayerOgRouter(playerLoader);

export default router;
