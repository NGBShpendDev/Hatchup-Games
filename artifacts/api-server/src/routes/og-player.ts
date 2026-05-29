import { db } from "@workspace/db";
import { playersTable, hatchlingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createPlayerOgRouter, type OgPlayerLoader } from "./og-router.ts";
import type { OgPlayerInput, OgHatchlingInput } from "./og-render.ts";
import { getEntitlement } from "../services/entitlement.ts";
import { resolveAccentColor, resolveAccentColorId } from "../services/accentColors.ts";

const playerLoader: OgPlayerLoader = async (username: string): Promise<OgPlayerInput | null> => {
  try {
    const row = await db.query.playersTable.findFirst({
      where: eq(playersTable.username, username),
    });
    if (!row) return null;
    // Honour the same privacy gates as the authenticated profile endpoint:
    // hidden accounts and minor accounts must not be discoverable via OG routes.
    if (row.locationVisibility === "hidden" || row.isMinor) return null;
    const tier = getEntitlement(row).tier;
    const accentId = resolveAccentColorId(row.shareAccentColor, tier);
    const accent = resolveAccentColor(row.shareAccentColor, tier);

    let activeHatchling: OgHatchlingInput | null = null;
    if (row.activeHatchlingId) {
      const h = await db.query.hatchlingsTable.findFirst({
        where: eq(hatchlingsTable.id, row.activeHatchlingId),
        columns: { name: true, rarity: true, imageUrl: true },
      });
      if (h) {
        activeHatchling = {
          name: h.name,
          rarity: h.rarity,
          spriteUrl: h.imageUrl ?? null,
        };
      }
    }

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
      activeHatchling,
    };
  } catch {
    return null;
  }
};

const router = createPlayerOgRouter(playerLoader);

export default router;
