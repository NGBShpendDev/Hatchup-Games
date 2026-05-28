export const RARITY_COLORS: Record<string, string> = {
  common: "#9ca3af",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
  mythic: "#dc2626",
  ancient: "#6366f1",
  celestial: "#e2e8f0",
};

export const getRarityColor = (rarity?: string | null): string =>
  RARITY_COLORS[rarity ?? "common"] ?? "#9ca3af";

export const capitalize = (s?: string | null) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
