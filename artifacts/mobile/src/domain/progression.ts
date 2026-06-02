import {
  ACTIVE_PROGRESSION_PROFILE,
  type ProgressionProfile,
} from "./progressionConfig";

export type MonsterStage = "egg" | "baby" | "teen" | "final";

export interface StageDefinition {
  id: MonsterStage;
  label: string;
  xp: number;
}

export function getMonsterStages(
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): readonly StageDefinition[] {
  return [
    { id: "egg", label: "Egg", xp: profile.stages.egg },
    { id: "baby", label: "Baby", xp: profile.stages.baby },
    { id: "teen", label: "Teen", xp: profile.stages.teen },
    { id: "final", label: "Final", xp: profile.stages.final },
  ];
}

export const MONSTER_STAGES = getMonsterStages();

export function getMonsterStage(
  totalXp: number,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): StageDefinition {
  return [...getMonsterStages(profile)]
    .reverse()
    .find((stage) => totalXp >= stage.xp)!;
}

export function getProgression(
  totalXp: number,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
) {
  const stages = getMonsterStages(profile);
  const current = getMonsterStage(totalXp, profile);
  const currentIndex = stages.findIndex((stage) => stage.id === current.id);
  const next = stages[currentIndex + 1] ?? null;
  const progress = next ? (totalXp - current.xp) / (next.xp - current.xp) : 1;

  return {
    current,
    next,
    progress: Math.min(Math.max(progress, 0), 1),
    xpToNext: next ? Math.max(next.xp - totalXp, 0) : 0,
  };
}
