import { db } from "@workspace/db";
import {
  artifactsTable,
  playerArtifactsTable,
  artifactWorldNotificationsTable,
  fitnessBarsTable,
  playersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Fitness bar XP constants ──────────────────────────────────────────────────
export const BAR_TYPES = [
  "strength", "speed", "cardio", "recovery",
  "consistency", "endurance", "agility", "discipline",
] as const;
export type BarType = typeof BAR_TYPES[number];

// XP needed to reach each level (level n requires n*200 cumulative XP from level 1)
const XP_PER_LEVEL = 200;
export function barLevelForXp(xp: number): number {
  return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
}

// Maps activity type → which bars get XP (and how much per unit)
const BAR_ACTIVITY_MAP: Record<string, Array<{ bar: BarType; xpPer: number }>> = {
  steps:          [{ bar: "cardio",       xpPer: 0.01 }, { bar: "consistency", xpPer: 0.005 }],
  running:        [{ bar: "cardio",       xpPer: 3    }, { bar: "speed",       xpPer: 2     }, { bar: "endurance",   xpPer: 2 }],
  walking:        [{ bar: "cardio",       xpPer: 1.5  }, { bar: "consistency", xpPer: 0.5   }],
  cycling:        [{ bar: "speed",        xpPer: 2    }, { bar: "cardio",      xpPer: 1.5   }, { bar: "endurance",   xpPer: 1.5 }],
  swimming:       [{ bar: "endurance",    xpPer: 3    }, { bar: "cardio",      xpPer: 2     }],
  weightlifting:  [{ bar: "strength",     xpPer: 3    }, { bar: "endurance",   xpPer: 1     }],
  pushups:        [{ bar: "strength",     xpPer: 0.5  }],
  squats:         [{ bar: "strength",     xpPer: 0.5  }],
  pullups:        [{ bar: "strength",     xpPer: 1    }],
  planks:         [{ bar: "strength",     xpPer: 0.5  }, { bar: "endurance",   xpPer: 0.3   }],
  situps:         [{ bar: "strength",     xpPer: 0.4  }],
  burpees:        [{ bar: "agility",      xpPer: 1    }, { bar: "cardio",      xpPer: 0.5   }],
  hiit:           [{ bar: "agility",      xpPer: 4    }, { bar: "cardio",      xpPer: 2     }],
  yoga:           [{ bar: "agility",      xpPer: 2    }, { bar: "recovery",    xpPer: 1     }],
  stretching:     [{ bar: "recovery",     xpPer: 1.5  }, { bar: "agility",     xpPer: 0.5   }],
  sleep:          [{ bar: "recovery",     xpPer: 8    }, { bar: "discipline",  xpPer: 4     }],
  meditation:     [{ bar: "discipline",   xpPer: 2    }, { bar: "recovery",    xpPer: 1     }],
  hydration:      [{ bar: "discipline",   xpPer: 2    }],
  active_minutes: [{ bar: "cardio",       xpPer: 1.5  }],
  calories:       [{ bar: "endurance",    xpPer: 0.002}],
};

// Every activity awards a small amount of consistency XP
const CONSISTENCY_BASE_XP = 5;

// ── Award bar XP after an activity ──────────────────────────────────────────
export async function awardFitnessBarXp(
  playerId: number,
  activityType: string,
  activityValue: number,
): Promise<void> {
  const grants = BAR_ACTIVITY_MAP[activityType] ?? [];
  const allGrants: Array<{ bar: BarType; xp: number }> = [
    ...grants.map(g => ({ bar: g.bar, xp: Math.round(activityValue * g.xpPer) })),
    { bar: "consistency", xp: CONSISTENCY_BASE_XP },
  ];

  for (const { bar, xp } of allGrants) {
    if (xp <= 0) continue;
    const existing = await db.query.fitnessBarsTable.findFirst({
      where: and(
        eq(fitnessBarsTable.playerId, playerId),
        eq(fitnessBarsTable.barType, bar),
      ),
    });

    if (existing) {
      const newXp = existing.xp + xp;
      await db.update(fitnessBarsTable).set({
        xp: newXp,
        level: barLevelForXp(newXp),
        updatedAt: new Date(),
      }).where(eq(fitnessBarsTable.id, existing.id));
    } else {
      const newXp = xp;
      await db.insert(fitnessBarsTable).values({
        playerId,
        barType: bar,
        xp: newXp,
        level: barLevelForXp(newXp),
      }).onConflictDoNothing();
    }
  }
}

// ── Get all fitness bars for a player (returns 8 bars, defaulting missing ones) ─
export async function getPlayerFitnessBars(playerId: number) {
  const rows = await db.query.fitnessBarsTable.findMany({
    where: eq(fitnessBarsTable.playerId, playerId),
  });

  return BAR_TYPES.map(barType => {
    const row = rows.find(r => r.barType === barType);
    return {
      barType,
      level: row?.level ?? 1,
      xp: row?.xp ?? 0,
      nextLevelXp: XP_PER_LEVEL,
      xpInCurrentLevel: row ? row.xp % XP_PER_LEVEL : 0,
      progressPct: row ? Math.round((row.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100) : 0,
    };
  });
}

// ── Artifact milestone engine ─────────────────────────────────────────────────
// Called after each fitness log to check if any new artifacts should be awarded.
export async function checkAndAwardArtifacts(
  playerId: number,
  playerUsername: string,
): Promise<Array<typeof artifactsTable.$inferSelect>> {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) return [];

  const allArtifacts = await db.query.artifactsTable.findMany();
  const owned = await db.query.playerArtifactsTable.findMany({
    where: eq(playerArtifactsTable.playerId, playerId),
  });
  const ownedIds = new Set(owned.map(o => o.artifactId));

  const bars = await db.query.fitnessBarsTable.findMany({
    where: eq(fitnessBarsTable.playerId, playerId),
  });
  const barLevels: Record<string, number> = {};
  for (const b of bars) barLevels[b.barType] = b.level;

  const newlyAwarded: typeof artifactsTable.$inferSelect[] = [];

  for (const artifact of allArtifacts) {
    if (ownedIds.has(artifact.id)) continue;
    if (!artifact.triggerKey || artifact.triggerValue === null) continue;

    let qualified = false;
    const tv = artifact.triggerValue;

    switch (artifact.triggerKey) {
      case "streak_days":
        qualified = player.currentStreak >= tv;
        break;
      case "total_steps":
        qualified = player.totalSteps >= tv;
        break;
      case "total_workouts":
        qualified = player.totalWorkouts >= tv;
        break;
      case "lifetime_pushups":
        qualified = (player.lifetimePushups ?? 0) >= tv;
        break;
      case "lifetime_squats":
        qualified = (player.lifetimeSquats ?? 0) >= tv;
        break;
      case "strength_bar_level":
        qualified = (barLevels["strength"] ?? 1) >= tv;
        break;
      case "speed_bar_level":
        qualified = (barLevels["speed"] ?? 1) >= tv;
        break;
      case "endurance_bar_level":
        qualified = (barLevels["endurance"] ?? 1) >= tv;
        break;
      case "discipline_bar_level":
        qualified = (barLevels["discipline"] ?? 1) >= tv;
        break;
      case "agility_bar_level":
        qualified = (barLevels["agility"] ?? 1) >= tv;
        break;
    }

    if (!qualified) continue;

    try {
      const inserted = await db.insert(playerArtifactsTable).values({
        playerId,
        artifactId: artifact.id,
      }).onConflictDoNothing().returning();

      if (inserted.length > 0) {
        newlyAwarded.push(artifact);

        // World notification for Mythic+ rarity
        const mythicPlus = ["Mythic", "Ancient", "Celestial"];
        if (mythicPlus.includes(artifact.rarity)) {
          await db.insert(artifactWorldNotificationsTable).values({
            playerId,
            playerUsername,
            artifactId: artifact.id,
            artifactName: artifact.name,
            rarity: artifact.rarity,
          }).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err, playerId, artifactId: artifact.id }, "Error awarding artifact");
    }
  }

  return newlyAwarded;
}

// ── Get recent world notifications (Mythic+ drops) ────────────────────────────
export async function getRecentWorldNotifications(limit = 10) {
  const rows = await db.query.artifactWorldNotificationsTable.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit,
  });
  return rows;
}
