import { seededRng } from "./seed";

export type EggRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "ancient" | "celestial";
export type EggType  = "fire" | "water" | "earth" | "air" | "electric" | "nature" | "dark" | "light" | "balanced" | "normal";

const TYPE_PALETTES: Record<string, [string, string, string]> = {
  fire:     ["#ff6b35", "#ff2d55", "#ff9f0a"],
  water:    ["#007aff", "#5ac8fa", "#34aadc"],
  earth:    ["#b8860b", "#cd853f", "#8b6914"],
  air:      ["#b0d4f1", "#64b5f6", "#8ec5fc"],
  electric: ["#ffd60a", "#ff9f0a", "#ffe234"],
  nature:   ["#34c759", "#30d158", "#a3e635"],
  dark:     ["#8e44ad", "#5e2d91", "#bf5af2"],
  light:    ["#fff8dc", "#ffe4b5", "#ffd700"],
  balanced: ["#ee2b8c", "#7c3aed", "#06b6d4"],
  normal:   ["#94a3b8", "#6b7280", "#9ca3af"],
};

const RARITY_GLOW: Record<EggRarity, string> = {
  common:    "#9ca3af",
  uncommon:  "#22c55e",
  rare:      "#3b82f6",
  epic:      "#a855f7",
  legendary: "#f59e0b",
  mythic:    "#ef4444",
  ancient:   "#6366f1",
  celestial: "#f0f9ff",
};

const RARITY_GLOW_INTENSITY: Record<EggRarity, number> = {
  common:    0.15,
  uncommon:  0.25,
  rare:      0.35,
  epic:      0.50,
  legendary: 0.70,
  mythic:    0.85,
  ancient:   0.80,
  celestial: 1.00,
};

export type PatternType = "scales" | "hex" | "swirl" | "runes" | "crystal" | "dots" | "sparks" | "vines";

const RARITY_PARTICLE_COUNT: Record<EggRarity, number> = {
  common:    0,
  uncommon:  0,
  rare:      2,
  epic:      4,
  legendary: 7,
  mythic:    9,
  ancient:   8,
  celestial: 12,
};

const RARITY_GEM_COUNT: Record<EggRarity, number> = {
  common:    0,
  uncommon:  1,
  rare:      2,
  epic:      3,
  legendary: 4,
  mythic:    4,
  ancient:   5,
  celestial: 6,
};

const PATTERNS: PatternType[] = ["scales", "hex", "swirl", "runes", "crystal", "dots", "sparks", "vines"];

export interface EggDna {
  rarity:         EggRarity;
  type:           EggType;
  primaryColor:   string;
  secondaryColor: string;
  accentColor:    string;
  glowColor:      string;
  glowIntensity:  number;
  pattern:        PatternType;
  patternOpacity: number;
  gemCount:       number;
  gemColors:      string[];
  particleCount:  number;
  particleColor:  string;
  shimmer:        boolean;
  shapeVariant:   0 | 1 | 2;
  markingAngle:   number;
  hasRune:        boolean;
  hasCrack:       boolean;
}

export function generateEggDna(
  id: number,
  type: string = "balanced",
  rarity: string = "common",
): EggDna {
  const r = seededRng(id * 2654435761 + 1);

  const normalRarity  = rarity.toLowerCase() as EggRarity;
  const normalType    = type.toLowerCase() as EggType;
  const palette       = TYPE_PALETTES[normalType] ?? TYPE_PALETTES["balanced"]!;
  const glowColor     = RARITY_GLOW[normalRarity] ?? "#9ca3af";

  const [primary, secondary, accent] = [
    palette[0]!,
    palette[1]!,
    palette[2]!,
  ];

  const gemPool = [glowColor, accent, secondary, "#ffffff", "#ffd700", "#ff69b4", "#00ffff", "#7fff00"];

  return {
    rarity:         normalRarity,
    type:           normalType,
    primaryColor:   primary,
    secondaryColor: secondary,
    accentColor:    accent,
    glowColor,
    glowIntensity:  RARITY_GLOW_INTENSITY[normalRarity] ?? 0.15,
    pattern:        r.pick(PATTERNS),
    patternOpacity: r.range(0.12, 0.30),
    gemCount:       RARITY_GEM_COUNT[normalRarity] ?? 0,
    gemColors:      Array.from({ length: 6 }, (_, i) => gemPool[i % gemPool.length]!),
    particleCount:  RARITY_PARTICLE_COUNT[normalRarity] ?? 0,
    particleColor:  glowColor,
    shimmer:        normalRarity !== "common",
    shapeVariant:   r.int(0, 2) as 0 | 1 | 2,
    markingAngle:   r.range(-30, 30),
    hasRune:        ["ancient", "celestial", "mythic"].includes(normalRarity),
    hasCrack:       ["mythic", "legendary"].includes(normalRarity) && r.bool(0.6),
  };
}
