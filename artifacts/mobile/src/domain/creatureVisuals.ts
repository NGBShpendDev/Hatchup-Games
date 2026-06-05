export type CreatureVisualStage = "baby" | "teen" | "final";

export function getCreatureVisualStage(level: number): CreatureVisualStage {
  if (level >= 15) return "final";
  if (level >= 5) return "teen";
  return "baby";
}
