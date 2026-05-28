import type { CSSProperties, ReactNode } from "react";

export const CROWN_SLUG_PREFIX = "crown_of_the_bracket";

export function isCrownSlug(slug: string): boolean {
  return slug.startsWith(CROWN_SLUG_PREFIX);
}

export function crownChallengeId(slug: string): number | null {
  const m = slug.match(/^crown_of_the_bracket__c(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

interface CrownVariant {
  gradient: string;
  ring: string;
  glyph: string;
  filter: string;
  shadow: string;
}

const CROWN_VARIANTS: CrownVariant[] = [
  {
    gradient: "from-yellow-400 via-amber-500 to-orange-600",
    ring: "ring-yellow-300/70",
    glyph: "👑",
    filter: "drop-shadow(0 0 4px rgba(253,224,71,0.9))",
    shadow: "shadow-yellow-500/40",
  },
  {
    gradient: "from-rose-400 via-pink-500 to-fuchsia-600",
    ring: "ring-pink-300/70",
    glyph: "👑",
    filter: "hue-rotate(300deg) saturate(1.4) drop-shadow(0 0 4px rgba(244,114,182,0.9))",
    shadow: "shadow-pink-500/40",
  },
  {
    gradient: "from-cyan-400 via-sky-500 to-blue-600",
    ring: "ring-cyan-300/70",
    glyph: "👑",
    filter: "hue-rotate(180deg) saturate(1.3) drop-shadow(0 0 4px rgba(34,211,238,0.9))",
    shadow: "shadow-cyan-500/40",
  },
  {
    gradient: "from-emerald-400 via-green-500 to-teal-600",
    ring: "ring-emerald-300/70",
    glyph: "👑",
    filter: "hue-rotate(90deg) saturate(1.3) drop-shadow(0 0 4px rgba(52,211,153,0.9))",
    shadow: "shadow-emerald-500/40",
  },
  {
    gradient: "from-violet-400 via-purple-500 to-indigo-600",
    ring: "ring-violet-300/70",
    glyph: "👑",
    filter: "hue-rotate(240deg) saturate(1.4) drop-shadow(0 0 4px rgba(167,139,250,0.9))",
    shadow: "shadow-violet-500/40",
  },
  {
    gradient: "from-red-400 via-rose-500 to-red-700",
    ring: "ring-red-300/70",
    glyph: "👑",
    filter: "hue-rotate(-20deg) saturate(1.5) drop-shadow(0 0 4px rgba(248,113,113,0.9))",
    shadow: "shadow-red-500/40",
  },
  {
    gradient: "from-zinc-200 via-slate-300 to-zinc-500",
    ring: "ring-slate-200/70",
    glyph: "👑",
    filter: "grayscale(0.6) brightness(1.2) drop-shadow(0 0 4px rgba(226,232,240,0.9))",
    shadow: "shadow-slate-300/40",
  },
  {
    gradient: "from-amber-700 via-orange-800 to-stone-900",
    ring: "ring-amber-600/70",
    glyph: "👑",
    filter: "sepia(0.5) saturate(1.6) drop-shadow(0 0 4px rgba(180,83,9,0.9))",
    shadow: "shadow-amber-700/40",
  },
];

function variantForId(id: number): CrownVariant {
  const idx = ((id % CROWN_VARIANTS.length) + CROWN_VARIANTS.length) % CROWN_VARIANTS.length;
  return CROWN_VARIANTS[idx]!;
}

function variantForSlug(slug: string): { variant: CrownVariant; seasonLabel: string | null } {
  const id = crownChallengeId(slug);
  if (id == null) {
    return { variant: CROWN_VARIANTS[0]!, seasonLabel: null };
  }
  return { variant: variantForId(id), seasonLabel: `S${id}` };
}

interface CrownArtProps {
  slug: string;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<CrownArtProps["size"]>, {
  wrap: string;
  glyph: string;
  badge: string;
}> = {
  sm: { wrap: "w-full h-full text-[14px]", glyph: "text-[14px]", badge: "text-[7px] px-1 -top-1 -right-1" },
  md: { wrap: "w-full h-full text-[20px]", glyph: "text-[20px]", badge: "text-[8px] px-1 -top-1 -right-1" },
  lg: { wrap: "w-full h-full text-[28px]", glyph: "text-[28px]", badge: "text-[9px] px-1.5 -top-1 -right-1" },
};

export function CrownArt({ slug, size = "md", showBadge = true }: CrownArtProps): ReactNode {
  const { variant, seasonLabel } = variantForSlug(slug);
  const sz = SIZE_CLASSES[size];
  const glyphStyle: CSSProperties = { filter: variant.filter };
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-md bg-gradient-to-br ${variant.gradient} ring-1 ${variant.ring} ${variant.shadow} ${sz.wrap}`}
      data-testid={`crown-art${seasonLabel ? `-${seasonLabel.toLowerCase()}` : ""}`}
    >
      <span className={`leading-none ${sz.glyph}`} style={glyphStyle}>
        {variant.glyph}
      </span>
      {showBadge && seasonLabel && (
        <span
          className={`absolute ${sz.badge} rounded-full bg-black/80 text-white font-black tracking-tight leading-none py-[1px] border border-white/30`}
        >
          {seasonLabel}
        </span>
      )}
    </span>
  );
}
