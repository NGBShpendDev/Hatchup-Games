export type MonsterStage = "egg" | "baby" | "teen" | "final";

export interface StageDefinition {
  id: MonsterStage;
  label: string;
  xp: number;
}

export const MONSTER_STAGES: readonly StageDefinition[] = [
  { id: "egg", label: "Egg", xp: 0 },
  { id: "baby", label: "Baby", xp: 200 },
  { id: "teen", label: "Teen", xp: 700 },
  { id: "final", label: "Final", xp: 1500 },
] as const;

export function getMonsterStage(totalXp: number): StageDefinition {
  return [...MONSTER_STAGES].reverse().find((stage) => totalXp >= stage.xp)!;
}

export function getProgression(totalXp: number) {
  const current = getMonsterStage(totalXp);
  const currentIndex = MONSTER_STAGES.findIndex((stage) => stage.id === current.id);
  const next = MONSTER_STAGES[currentIndex + 1] ?? null;
  const progress = next
    ? (totalXp - current.xp) / (next.xp - current.xp)
    : 1;

  return {
    current,
    next,
    progress: Math.min(Math.max(progress, 0), 1),
    xpToNext: next ? Math.max(next.xp - totalXp, 0) : 0,
  };
}
