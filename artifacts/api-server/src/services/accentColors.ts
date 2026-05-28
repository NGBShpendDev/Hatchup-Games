import type { Tier } from "./entitlement.ts";

/**
 * Accent color palette for branded share cards.
 *
 * Each entry defines a two-stop linear gradient that drives the accent stripes,
 * tag pill, avatar ring, and pill borders on OG share cards. Premium-only ids
 * are gated server-side by `resolveAccentColor` against the entitlement tier
 * so a free player can never coerce a premium-only color by patching the value
 * directly on `playersTable`.
 */
export interface AccentColorOption {
  id: string;
  name: string;
  from: string;
  to: string;
  premium: boolean;
}

export const ACCENT_COLOR_OPTIONS: readonly AccentColorOption[] = [
  // Free tier (4 options)
  { id: "default", name: "HatchUp Sunset", from: "#ff3d8b", to: "#ff6b3d", premium: false },
  { id: "ocean",   name: "Ocean",          from: "#3da6ff", to: "#5cf2d6", premium: false },
  { id: "forest",  name: "Forest",         from: "#34d399", to: "#84cc16", premium: false },
  { id: "violet",  name: "Violet",         from: "#a855f7", to: "#ec4899", premium: false },
  // Premium tier (8 additional options)
  { id: "ember",     name: "Ember",     from: "#f97316", to: "#eab308", premium: true },
  { id: "ruby",      name: "Ruby",      from: "#ef4444", to: "#f43f5e", premium: true },
  { id: "aurora",    name: "Aurora",    from: "#22d3ee", to: "#a78bfa", premium: true },
  { id: "gold",      name: "Gold",      from: "#facc15", to: "#f59e0b", premium: true },
  { id: "midnight",  name: "Midnight",  from: "#6366f1", to: "#0ea5e9", premium: true },
  { id: "monochrome", name: "Mono",     from: "#e5e7eb", to: "#9ca3af", premium: true },
  { id: "neon-lime", name: "Neon Lime", from: "#84cc16", to: "#22d3ee", premium: true },
  { id: "blossom",   name: "Blossom",   from: "#f9a8d4", to: "#fbcfe8", premium: true },
] as const;

const ACCENT_BY_ID: Record<string, AccentColorOption> = Object.fromEntries(
  ACCENT_COLOR_OPTIONS.map((opt) => [opt.id, opt]),
);

export const DEFAULT_ACCENT: AccentColorOption = ACCENT_BY_ID.default!;

export interface AccentGradient {
  from: string;
  to: string;
}

/**
 * Resolve a stored accent color id to the gradient that should be rendered on
 * a share card. Unknown ids and premium-only ids that the player isn't
 * entitled to fall back to the brand default — share cards always render with
 * a valid gradient, never an empty/missing one.
 */
export function resolveAccentColor(
  id: string | null | undefined,
  tier: Tier,
): AccentGradient {
  if (!id) return DEFAULT_ACCENT;
  const opt = ACCENT_BY_ID[id];
  if (!opt) return DEFAULT_ACCENT;
  if (opt.premium && tier !== "premium") return DEFAULT_ACCENT;
  return { from: opt.from, to: opt.to };
}

/**
 * The same as `resolveAccentColor` but returns the id that will actually be
 * used — useful for ETag construction so the cached share card key reflects
 * the gradient that was actually rendered (and a free player toggling a
 * premium-only color doesn't bust the cache for no visual change).
 */
export function resolveAccentColorId(
  id: string | null | undefined,
  tier: Tier,
): string {
  if (!id) return "default";
  const opt = ACCENT_BY_ID[id];
  if (!opt) return "default";
  if (opt.premium && tier !== "premium") return "default";
  return opt.id;
}

/** All accent color ids visible to a player of the given tier. */
export function getAvailableAccents(tier: Tier): AccentColorOption[] {
  if (tier === "premium") return [...ACCENT_COLOR_OPTIONS];
  return ACCENT_COLOR_OPTIONS.filter((opt) => !opt.premium);
}

/** True when the supplied id is a known palette entry (regardless of tier). */
export function isKnownAccentId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ACCENT_BY_ID, id);
}
