import { seededRng } from "./seed";

export type CreatureRealm = "balance" | "strength" | "cardio" | "beast";

/** 4 body archetypes — one per realm, with 3 variants each */
export type BodyArchetype = "puffball" | "titan" | "phantom" | "feral";

const REALM_ARCHETYPE: Record<CreatureRealm, BodyArchetype> = {
  balance:  "puffball",
  strength: "titan",
  cardio:   "phantom",
  beast:    "feral",
};

const REALM_PALETTES: Record<CreatureRealm, [string, string, string][]> = {
  balance: [
    ["#ee2b8c", "#a855f7", "#06b6d4"],
    ["#f472b6", "#c084fc", "#38bdf8"],
    ["#e879f9", "#8b5cf6", "#22d3ee"],
  ],
  strength: [
    ["#ef4444", "#dc2626", "#f97316"],
    ["#b91c1c", "#991b1b", "#c2410c"],
    ["#f87171", "#fb923c", "#fbbf24"],
  ],
  cardio: [
    ["#3b82f6", "#06b6d4", "#a5f3fc"],
    ["#0ea5e9", "#38bdf8", "#7dd3fc"],
    ["#6366f1", "#818cf8", "#c7d2fe"],
  ],
  beast: [
    ["#65a30d", "#84cc16", "#a3e635"],
    ["#4d7c0f", "#16a34a", "#22c55e"],
    ["#d97706", "#b45309", "#92400e"],
  ],
};

export const RARITY_AURA: Record<string, { color: string; radius: number; opacity: number }> = {
  common:    { color: "#9ca3af", radius: 1.05, opacity: 0.10 },
  uncommon:  { color: "#22c55e", radius: 1.10, opacity: 0.20 },
  rare:      { color: "#3b82f6", radius: 1.15, opacity: 0.30 },
  epic:      { color: "#a855f7", radius: 1.22, opacity: 0.40 },
  legendary: { color: "#f59e0b", radius: 1.30, opacity: 0.55 },
  mythic:    { color: "#ef4444", radius: 1.35, opacity: 0.65 },
  ancient:   { color: "#6366f1", radius: 1.32, opacity: 0.60 },
  celestial: { color: "#f0f9ff", radius: 1.40, opacity: 0.75 },
};

export interface EyeConfig {
  shape:     "round" | "slant" | "wide" | "narrow";
  pupilSize: number;
  glow:      boolean;
  color:     string;
  pupilColor:string;
}

export interface FeatureSet {
  hasHorns:     boolean;
  hornCount:    1 | 2 | 3;
  hasWings:     boolean;
  wingSize:     "small" | "medium" | "large";
  hasTail:      boolean;
  tailType:     "simple" | "spiked" | "fluffy" | "dual";
  hasSpines:    boolean;
  spineCount:   number;
  hasArmor:     boolean;
  hasCrystal:   boolean;
  hasMane:      boolean;
  glowingVeins: boolean;
}

export interface CreatureDna {
  realm:        CreatureRealm;
  rarity:       string;
  archetype:    BodyArchetype;
  variant:      0 | 1 | 2;
  primaryColor: string;
  bodyColor:    string;
  accentColor:  string;
  eyeConfig:    EyeConfig;
  features:     FeatureSet;
  markingColor: string;
  aura:         { color: string; radius: number; opacity: number };
  isShiny:      boolean;
  patternSeed:  number;
  breathDepth:  number;
}

const EYE_SHAPES: EyeConfig["shape"][] = ["round", "slant", "wide", "narrow"];
const EYE_COLORS = ["#00ff88", "#ff4488", "#44aaff", "#ffaa00", "#ff00ff", "#00ffff", "#ffffff", "#ff6600"];
const PUPIL_COLORS = ["#000000", "#1a0033", "#001a33", "#330000", "#003300"];

function rarityNum(rarity: string): number {
  return ["common","uncommon","rare","epic","legendary","mythic","ancient","celestial"].indexOf(rarity.toLowerCase());
}

export function generateCreatureDna(
  id: number,
  realm: string    = "balance",
  rarity: string   = "common",
  isShiny: boolean = false,
): CreatureDna {
  const r        = seededRng(id * 1234567891 + 37);
  const rlm      = (realm === "balance" || realm === "strength" || realm === "cardio" || realm === "beast"
    ? realm : "balance") as CreatureRealm;
  const archetype = REALM_ARCHETYPE[rlm];
  const rNum      = rarityNum(rarity);
  const palettes  = REALM_PALETTES[rlm];
  const paletteIdx = r.int(0, palettes.length - 1);
  const [primary, body, accent] = palettes[paletteIdx]!;

  const eyeColor   = isShiny ? "#ffd700" : r.pick(EYE_COLORS);
  const pupilColor = r.pick(PUPIL_COLORS);

  const features: FeatureSet = {
    hasHorns:     rNum >= 1 ? r.bool(0.7) : r.bool(0.3),
    hornCount:    rNum >= 4 ? (r.bool(0.4) ? 3 : 2) : (r.bool(0.5) ? 2 : 1),
    hasWings:     rlm === "cardio" ? true : (rNum >= 3 ? r.bool(0.6) : r.bool(0.15)),
    wingSize:     rNum >= 5 ? "large" : (rNum >= 3 ? "medium" : "small"),
    hasTail:      true,
    tailType:     rNum >= 5 ? r.pick(["spiked","dual"] as const)
                 : rNum >= 3 ? r.pick(["fluffy","spiked"] as const)
                 : r.pick(["simple","fluffy"] as const),
    hasSpines:    rlm === "beast" ? r.bool(0.8) : (rNum >= 3 ? r.bool(0.5) : false),
    spineCount:   r.int(3, 7),
    hasArmor:     rlm === "strength" ? r.bool(0.7) : (rNum >= 4 ? r.bool(0.4) : false),
    hasCrystal:   rNum >= 3 ? r.bool(0.5) : false,
    hasMane:      rlm === "beast" ? r.bool(0.5) : (rNum >= 5 ? r.bool(0.4) : false),
    glowingVeins: rNum >= 5,
  };

  return {
    realm:        rlm,
    rarity:       rarity.toLowerCase(),
    archetype,
    variant:      r.int(0, 2) as 0 | 1 | 2,
    primaryColor: isShiny ? "#ffd700" : primary,
    bodyColor:    isShiny ? "#fff8dc" : body,
    accentColor:  isShiny ? "#ffb300" : accent,
    eyeConfig: {
      shape:      rlm === "beast" ? "slant" : rlm === "strength" ? "narrow" : r.pick(EYE_SHAPES),
      pupilSize:  r.range(0.45, 0.65),
      glow:       rNum >= 3,
      color:      eyeColor,
      pupilColor,
    },
    features,
    markingColor: isShiny ? "#ffd70055" : (primary + "55"),
    aura:         RARITY_AURA[rarity.toLowerCase()] ?? RARITY_AURA["common"]!,
    isShiny,
    patternSeed:  Math.floor(r.next() * 999999),
    breathDepth:  r.range(0.012, 0.025),
  };
}
