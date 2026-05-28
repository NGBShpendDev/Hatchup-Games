import { db } from "@workspace/db";
import { playerBadgesTable, playersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export type BadgeTier = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";
export type BadgeCategory = "fitness" | "streak" | "hatchling" | "social" | "achievement" | "event" | "secret" | "strength" | "speed";

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  tier: BadgeTier;
  category: BadgeCategory;
  icon: string;
  isSecret: boolean;
  xpReward: number;
  coinsReward: number;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Fitness milestones
  { key: "FIRST_STEPS",      name: "First Steps",       description: "Log your first 1,000 steps",           tier: "Common",    category: "fitness",   icon: "👟", isSecret: false, xpReward: 50,    coinsReward: 25   },
  { key: "STEP_BEAST",       name: "10K Step Beast",    description: "Hit 10,000 steps in a single day",      tier: "Rare",      category: "fitness",   icon: "🔥", isSecret: false, xpReward: 200,   coinsReward: 100  },
  { key: "MARATHON_MOVER",   name: "Marathon Mover",    description: "Log 50,000 total steps",                tier: "Rare",      category: "fitness",   icon: "🏃", isSecret: false, xpReward: 500,   coinsReward: 200  },
  { key: "STEP_LEGEND",      name: "Step Legend",       description: "Log 250,000 total steps",               tier: "Epic",      category: "fitness",   icon: "⚡", isSecret: false, xpReward: 1000,  coinsReward: 500  },
  { key: "CARDIO_KING",      name: "Cardio King",       description: "Log 500 cardio minutes",                tier: "Epic",      category: "fitness",   icon: "💪", isSecret: false, xpReward: 800,   coinsReward: 400  },
  { key: "WORKOUT_WARRIOR",  name: "Workout Warrior",   description: "Log 20 workouts",                       tier: "Rare",      category: "fitness",   icon: "🏋️", isSecret: false, xpReward: 400,   coinsReward: 150  },
  { key: "STEPS_MYTHIC",     name: "Mythic Walker",     description: "Log 1,000,000 total steps",             tier: "Mythic",    category: "fitness",   icon: "🌟", isSecret: false, xpReward: 5000,  coinsReward: 2500 },

  // Streak system
  { key: "ON_FIRE",          name: "On Fire",           description: "Maintain a 3-day activity streak",      tier: "Common",    category: "streak",    icon: "🔥", isSecret: false, xpReward: 75,    coinsReward: 30   },
  { key: "BLAZING",          name: "Blazing",           description: "Maintain a 7-day streak",               tier: "Rare",      category: "streak",    icon: "🌶️", isSecret: false, xpReward: 250,   coinsReward: 100  },
  { key: "INFERNO",          name: "Inferno",           description: "Maintain a 30-day streak",              tier: "Epic",      category: "streak",    icon: "🌋", isSecret: false, xpReward: 1000,  coinsReward: 500  },
  { key: "ETERNAL_FLAME",    name: "Eternal Flame",     description: "Maintain a 100-day streak",             tier: "Legendary", category: "streak",    icon: "🏆", isSecret: false, xpReward: 3000,  coinsReward: 1500 },
  { key: "MYTHIC_GRINDER",   name: "Mythic Grinder",    description: "Maintain a 365-day streak",             tier: "Mythic",    category: "streak",    icon: "👑", isSecret: false, xpReward: 10000, coinsReward: 5000 },

  // Hatchling/creature
  { key: "HATCHER",          name: "Hatcher",           description: "Hatch your first Pal",                  tier: "Common",    category: "hatchling", icon: "🥚", isSecret: false, xpReward: 50,    coinsReward: 25   },
  { key: "COLLECTOR",        name: "Collector",         description: "Own 5 Hatchling Pals",                  tier: "Rare",      category: "hatchling", icon: "🎒", isSecret: false, xpReward: 300,   coinsReward: 150  },
  { key: "EVOLVER",          name: "Evolver",           description: "Evolve your first Pal",                 tier: "Rare",      category: "hatchling", icon: "✨", isSecret: false, xpReward: 300,   coinsReward: 150  },
  { key: "MYTHIC_TAMER",     name: "Mythic Tamer",      description: "Own a Mythic rarity Pal",               tier: "Legendary", category: "hatchling", icon: "🐉", isSecret: false, xpReward: 2000,  coinsReward: 1000 },

  // Achievement / leveling
  { key: "LEVEL_10",         name: "Rising Star",       description: "Reach player level 10",                 tier: "Common",    category: "achievement", icon: "⭐", isSecret: false, xpReward: 100,   coinsReward: 50   },
  { key: "LEVEL_25",         name: "Seasoned Trainer",  description: "Reach player level 25",                 tier: "Rare",      category: "achievement", icon: "🌠", isSecret: false, xpReward: 400,   coinsReward: 200  },
  { key: "LEVEL_50",         name: "Elite Trainer",     description: "Reach player level 50",                 tier: "Epic",      category: "achievement", icon: "💎", isSecret: false, xpReward: 1000,  coinsReward: 500  },
  { key: "LEVEL_100",        name: "Legendary Grinder", description: "Reach player level 100",                tier: "Legendary", category: "achievement", icon: "🔮", isSecret: false, xpReward: 5000,  coinsReward: 2500 },
  { key: "PRESTIGE_ONE",     name: "Prestige I",        description: "Complete your first prestige",          tier: "Mythic",    category: "achievement", icon: "🌈", isSecret: false, xpReward: 10000, coinsReward: 5000 },
  { key: "CHAMPION",         name: "Champion",          description: "Win your first competition",            tier: "Common",    category: "achievement", icon: "🥇", isSecret: false, xpReward: 100,   coinsReward: 50   },
  { key: "TOURNAMENT_KING",  name: "Tournament King",   description: "Win 10 competitions",                   tier: "Rare",      category: "achievement", icon: "👑", isSecret: false, xpReward: 500,   coinsReward: 250  },
  { key: "DAILY_DEVOTEE",    name: "Daily Devotee",     description: "Claim daily reward 7 days in a row",    tier: "Rare",      category: "achievement", icon: "📅", isSecret: false, xpReward: 300,   coinsReward: 150  },

  // Event / special
  { key: "FOUNDER",          name: "Founder",           description: "Early access pioneer — thank you!",     tier: "Epic",      category: "event",     icon: "🌍", isSecret: false, xpReward: 500,   coinsReward: 250  },

  // Secret badges
  { key: "MIDNIGHT_RUNNER",  name: "Midnight Runner",   description: "Log activity after midnight",           tier: "Rare",      category: "secret",    icon: "🌙", isSecret: true,  xpReward: 250,   coinsReward: 100  },
  { key: "EARLY_BIRD",       name: "Early Bird",        description: "Log activity before 6am",               tier: "Rare",      category: "secret",    icon: "🐦", isSecret: true,  xpReward: 250,   coinsReward: 100  },
  { key: "DRAGON_MASTER",    name: "Dragon Master",     description: "???",                                   tier: "Epic",      category: "secret",    icon: "🐲", isSecret: true,  xpReward: 500,   coinsReward: 250  },

  // ---- STRENGTH REP BADGES ----
  { key: "REP_1K",           name: "Rep Starter",       description: "Log 1,000 total reps across all exercises",   tier: "Common",    category: "strength", icon: "💪", isSecret: false, xpReward: 200,   coinsReward: 100  },
  { key: "REP_10K",          name: "Rep Machine",       description: "Log 10,000 total reps",                       tier: "Rare",      category: "strength", icon: "🦾", isSecret: false, xpReward: 500,   coinsReward: 250  },
  { key: "REP_50K",          name: "Iron Body",         description: "Log 50,000 total reps",                       tier: "Epic",      category: "strength", icon: "🏗️", isSecret: false, xpReward: 1500,  coinsReward: 750  },
  { key: "REP_100K",         name: "Rep God",           description: "Log 100,000 total reps",                      tier: "Legendary", category: "strength", icon: "🗿", isSecret: false, xpReward: 5000,  coinsReward: 2500 },
  { key: "PUSHUP_CENTURY",   name: "Pushup Century",    description: "Log 100 pushups in a single session",         tier: "Rare",      category: "strength", icon: "💥", isSecret: false, xpReward: 400,   coinsReward: 200  },
  { key: "IRON_WILL",        name: "Iron Will",         description: "Log 1,000 total pushups lifetime",            tier: "Epic",      category: "strength", icon: "⚙️", isSecret: false, xpReward: 800,   coinsReward: 400  },
  { key: "SQUAT_LEGEND",     name: "Squat Legend",      description: "Log 10,000 total squats lifetime",            tier: "Legendary", category: "strength", icon: "🏋️", isSecret: false, xpReward: 3000,  coinsReward: 1500 },

  // ---- RUNNING / SPEED BADGES ----
  { key: "SPEED_DEMON",      name: "Speed Demon",       description: "Log a run at sub-8 minute mile pace",         tier: "Rare",      category: "speed",    icon: "⚡", isSecret: false, xpReward: 500,   coinsReward: 250  },
  { key: "SUB_6_MILE",       name: "Sub-6 Minute Mile", description: "Log a run at sub-6 minute mile pace",         tier: "Epic",      category: "speed",    icon: "🚀", isSecret: false, xpReward: 1200,  coinsReward: 600  },
  { key: "MARATHON_BEAST",   name: "Marathon Beast",    description: "Log 26.2 miles of running (cumulative)",      tier: "Epic",      category: "speed",    icon: "🏅", isSecret: false, xpReward: 1000,  coinsReward: 500  },
  { key: "ENDURANCE_KING",   name: "Endurance King",    description: "Log 50+ running miles in a single month",     tier: "Legendary", category: "speed",    icon: "👑", isSecret: false, xpReward: 3000,  coinsReward: 1500 },
  { key: "LIGHTNING_RUNNER", name: "Lightning Runner",  description: "Log 100 miles of running (cumulative)",       tier: "Legendary", category: "speed",    icon: "⚡", isSecret: false, xpReward: 2500,  coinsReward: 1250 },
];

export const BADGE_MAP: Record<string, BadgeDefinition> = Object.fromEntries(
  BADGE_DEFINITIONS.map(b => [b.key, b])
);

/** XP needed to go from level n to n+1 */
export function xpForLevel(level: number): number {
  return Math.floor(150 * Math.pow(level, 1.1));
}

/** Given total accumulated XP, compute level + progress within level */
export function computeLevelProgress(totalXp: number) {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const xpForCurrentLevel = xpForLevel(level);
  return {
    level,
    xpCurrentLevel: remaining,
    xpForNextLevel: xpForCurrentLevel,
    xpPercent: Math.round((remaining / xpForCurrentLevel) * 100),
  };
}

/** Daily reward schedule — cycles every 7 days */
export function getDailyReward(dayStreak: number) {
  const day = ((dayStreak - 1) % 7) + 1;
  const rewards: Record<number, { coins: number; xp: number; bonus?: string }> = {
    1: { coins: 50,  xp: 25,  },
    2: { coins: 75,  xp: 50,  },
    3: { coins: 100, xp: 75,  bonus: "streak_freeze" },
    4: { coins: 100, xp: 100, },
    5: { coins: 125, xp: 125, },
    6: { coins: 150, xp: 150, },
    7: { coins: 250, xp: 300, bonus: "rare_egg_voucher" },
  };
  return { ...rewards[day]!, day };
}

/** Award a badge if not already earned. Returns definition if newly awarded. */
export async function awardBadge(playerId: number, badgeKey: string): Promise<BadgeDefinition | null> {
  const def = BADGE_MAP[badgeKey];
  if (!def) return null;

  const existing = await db.query.playerBadgesTable.findFirst({
    where: and(eq(playerBadgesTable.playerId, playerId), eq(playerBadgesTable.badgeKey, badgeKey)),
  });
  if (existing) return null;

  await db.insert(playerBadgesTable).values({ playerId, badgeKey }).onConflictDoNothing();

  await db.update(playersTable)
    .set({
      xp: sql`${playersTable.xp} + ${def.xpReward}`,
      coins: sql`${playersTable.coins} + ${def.coinsReward}`,
    })
    .where(eq(playersTable.id, playerId));

  return def;
}

/** Check player state and award any newly unlocked badges. Returns newly awarded badges. */
export async function checkAndAwardBadges(playerId: number, triggers: {
  totalSteps?: number;
  todaySteps?: number;
  currentStreak?: number;
  totalWorkouts?: number;
  level?: number;
  totalWins?: number;
  hatchlingCount?: number;
  hasEvolved?: boolean;
  hasMythicHatchling?: boolean;
  hasPrestige?: boolean;
  activityHour?: number;
  hasNamedDragon?: boolean;
  dailyRewardStreak?: number;
  // Strength triggers
  totalReps?: number;
  lifetimePushups?: number;
  lifetimeSquats?: number;
  sessionReps?: number;
  activityType?: string;
  // Running triggers (values in hundredths of miles for int storage)
  cumulativeRunMiles?: number;
  paceMinsPerMile?: number;
}): Promise<BadgeDefinition[]> {
  const awarded: BadgeDefinition[] = [];
  const tryAward = async (key: string) => {
    const b = await awardBadge(playerId, key);
    if (b) awarded.push(b);
  };

  const {
    totalSteps, todaySteps, currentStreak, totalWorkouts, level, totalWins,
    hatchlingCount, hasEvolved, hasMythicHatchling, hasPrestige,
    activityHour, hasNamedDragon, dailyRewardStreak,
    totalReps, lifetimePushups, lifetimeSquats, sessionReps, activityType,
    cumulativeRunMiles, paceMinsPerMile,
  } = triggers;

  if (totalSteps !== undefined) {
    if (totalSteps >= 1000)    await tryAward("FIRST_STEPS");
    if (totalSteps >= 50000)   await tryAward("MARATHON_MOVER");
    if (totalSteps >= 250000)  await tryAward("STEP_LEGEND");
    if (totalSteps >= 1000000) await tryAward("STEPS_MYTHIC");
  }
  if (todaySteps !== undefined && todaySteps >= 10000) await tryAward("STEP_BEAST");
  if (currentStreak !== undefined) {
    if (currentStreak >= 3)   await tryAward("ON_FIRE");
    if (currentStreak >= 7)   await tryAward("BLAZING");
    if (currentStreak >= 30)  await tryAward("INFERNO");
    if (currentStreak >= 100) await tryAward("ETERNAL_FLAME");
    if (currentStreak >= 365) await tryAward("MYTHIC_GRINDER");
  }
  if (totalWorkouts !== undefined && totalWorkouts >= 20) await tryAward("WORKOUT_WARRIOR");
  if (level !== undefined) {
    if (level >= 10)  await tryAward("LEVEL_10");
    if (level >= 25)  await tryAward("LEVEL_25");
    if (level >= 50)  await tryAward("LEVEL_50");
    if (level >= 100) await tryAward("LEVEL_100");
  }
  if (totalWins !== undefined) {
    if (totalWins >= 1)  await tryAward("CHAMPION");
    if (totalWins >= 10) await tryAward("TOURNAMENT_KING");
  }
  if (hatchlingCount !== undefined) {
    if (hatchlingCount >= 1) await tryAward("HATCHER");
    if (hatchlingCount >= 5) await tryAward("COLLECTOR");
  }
  if (hasEvolved)          await tryAward("EVOLVER");
  if (hasMythicHatchling)  await tryAward("MYTHIC_TAMER");
  if (hasPrestige)         await tryAward("PRESTIGE_ONE");
  if (activityHour !== undefined) {
    if (activityHour >= 0 && activityHour < 4) await tryAward("MIDNIGHT_RUNNER");
    if (activityHour < 6)                      await tryAward("EARLY_BIRD");
  }
  if (hasNamedDragon)       await tryAward("DRAGON_MASTER");
  if (dailyRewardStreak !== undefined && dailyRewardStreak >= 7) await tryAward("DAILY_DEVOTEE");

  // Strength / rep badges
  if (totalReps !== undefined) {
    if (totalReps >= 1000)   await tryAward("REP_1K");
    if (totalReps >= 10000)  await tryAward("REP_10K");
    if (totalReps >= 50000)  await tryAward("REP_50K");
    if (totalReps >= 100000) await tryAward("REP_100K");
  }
  if (activityType === "pushups" && sessionReps !== undefined && sessionReps >= 100) {
    await tryAward("PUSHUP_CENTURY");
  }
  if (lifetimePushups !== undefined && lifetimePushups >= 1000)  await tryAward("IRON_WILL");
  if (lifetimeSquats  !== undefined && lifetimeSquats  >= 10000) await tryAward("SQUAT_LEGEND");

  // Running / speed badges
  if (cumulativeRunMiles !== undefined) {
    if (cumulativeRunMiles >= 2620)  await tryAward("MARATHON_BEAST");   // 26.20 miles
    if (cumulativeRunMiles >= 10000) await tryAward("LIGHTNING_RUNNER"); // 100 miles
  }
  if (paceMinsPerMile !== undefined) {
    if (paceMinsPerMile < 8)  await tryAward("SPEED_DEMON");
    if (paceMinsPerMile < 6)  await tryAward("SUB_6_MILE");
  }

  return awarded;
}
