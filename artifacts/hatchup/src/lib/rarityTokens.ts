export interface RarityTokens {
  border: string;
  text: string;
  bg: string;
  aura: string;
  badgeCls: string;
  shadowColor: string;
}

export const RARITY_TOKENS: Record<string, RarityTokens> = {
  celestial: {
    border: "border-white",
    text: "text-white",
    bg: "bg-white/10",
    aura: "pal-aura-celestial",
    badgeCls: "border-white text-white bg-white/10",
    shadowColor: "rgba(255,255,255,0.6)",
  },
  ancient: {
    border: "border-teal-400",
    text: "text-teal-300",
    bg: "bg-teal-400/10",
    aura: "pal-aura-ancient",
    badgeCls: "border-teal-400 text-teal-300 bg-teal-400/10",
    shadowColor: "rgba(20,184,166,0.7)",
  },
  mythic: {
    border: "border-red-500",
    text: "text-red-400",
    bg: "bg-red-500/10",
    aura: "pal-aura-mythic",
    badgeCls: "border-red-500 text-red-400 bg-red-500/10",
    shadowColor: "rgba(239,68,68,0.7)",
  },
  legendary: {
    border: "border-yellow-500",
    text: "text-yellow-400",
    bg: "bg-yellow-500/10",
    aura: "pal-aura-legendary",
    badgeCls: "border-yellow-500 text-yellow-400 bg-yellow-500/10",
    shadowColor: "rgba(234,179,8,0.7)",
  },
  epic: {
    border: "border-purple-500",
    text: "text-purple-400",
    bg: "bg-purple-500/10",
    aura: "pal-aura-epic",
    badgeCls: "border-purple-500 text-purple-400 bg-purple-500/10",
    shadowColor: "rgba(168,85,247,0.5)",
  },
  rare: {
    border: "border-blue-500",
    text: "text-blue-400",
    bg: "bg-blue-500/10",
    aura: "pal-aura-rare",
    badgeCls: "border-blue-500 text-blue-400 bg-blue-500/10",
    shadowColor: "rgba(59,130,246,0.5)",
  },
  uncommon: {
    border: "border-emerald-500",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    aura: "pal-aura-uncommon",
    badgeCls: "border-emerald-500 text-emerald-400 bg-emerald-500/10",
    shadowColor: "rgba(16,185,129,0.4)",
  },
  common: {
    border: "border-gray-500",
    text: "text-gray-400",
    bg: "bg-gray-500/10",
    aura: "pal-aura-common",
    badgeCls: "border-gray-500 text-gray-400 bg-gray-500/10",
    shadowColor: "rgba(107,114,128,0.3)",
  },
};

export function getRarityTokens(rarity: string | null | undefined): RarityTokens {
  return RARITY_TOKENS[(rarity ?? "Common").toLowerCase()] ?? RARITY_TOKENS["common"];
}

export function getRarityBadgeCls(rarity: string | null | undefined): string {
  return getRarityTokens(rarity).badgeCls;
}
