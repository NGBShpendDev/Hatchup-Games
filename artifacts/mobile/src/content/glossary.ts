export const HATCHUP_TERMS = {
  collection: "Collection",
  egg: "Egg",
  eggProgress: "Egg progress",
  hatchery: "Hatchery",
  journeyXp: "Journey XP",
  pal: "Pal",
  palXp: "Pal XP",
  ranks: "Ranks",
  syncMovement: "Sync movement",
  weeklyGoal: "Weekly goal",
} as const;

export type HatchUpTerm = keyof typeof HATCHUP_TERMS;
