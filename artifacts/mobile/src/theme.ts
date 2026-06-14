export const moonlitHatcheryColors = {
  background: "#F4EEDF",
  surface: "#FFFCF4",
  ink: "#12201F",
  muted: "#707A78",
  line: "#E5D5BE",
  primary: "#004F46",
  primaryDeep: "#004F46",
  primaryText: "#FFFFFF",
  primarySoft: "#DDF7F0",
  accent: "#8A6CFF",
  accentSoft: "#EEE8FF",
  softPeach: "#EEE8FF",
  softBlue: "#DDF7F0",
  softLavender: "#EEE8FF",
  rewardGold: "#FFD45A",
  danger: "#B85A50",
  dangerSoft: "#FFE7E1",
  warmSurface: "#EEE8FF",
  cardShadow: "rgba(18, 32, 31, 0.09)",
  cardShadowStrong: "rgba(18, 32, 31, 0.16)",
  modalBackdrop: "rgba(18, 32, 31, 0.68)",
  translucentSurface: "rgba(255, 252, 244, 0.86)",
  avatarBorder: "rgba(18, 32, 31, 0.16)",
  leaf: "#46C878",
  ember: "#FF784F",
  tide: "#3DB7FF",
  storm: "#8A6CFF",
  egg: "#FFD45A",
  baby: "#46C878",
  teen: "#3DB7FF",
  final: "#8A6CFF",
} as const;

const moonlitHatcheryTheme = {
  colors: moonlitHatcheryColors,
  radii: {
    button: 18,
    card: 22,
    hero: 28,
    pill: 999,
  },
  spacing: {
    screen: 20,
    card: 16,
    section: 22,
    footerBottom: 30,
  },
  typography: {
    titleWeight: "900" as const,
    bodyLineHeight: 23,
  },
} as const;

// Market MVP source of truth:
// All supported theme names intentionally resolve to Moonlit Hatchery so stale
// EAS/env values cannot bring older palettes into
// TestFlight. After launch, add new variants by cloning this object and changing
// tokens here rather than hardcoding colors in screens.
export const themeVariants = {
  creatureAdventure: moonlitHatcheryTheme,
  default: moonlitHatcheryTheme,
  moonlitHatchery: moonlitHatcheryTheme,
  premiumGarden: moonlitHatcheryTheme,
  publicCohesion: moonlitHatcheryTheme,
} as const;

export type ThemeVariant = keyof typeof themeVariants;

const configuredTheme = process.env.EXPO_PUBLIC_HATCHUP_THEME as
  | ThemeVariant
  | undefined;

export const ACTIVE_THEME: ThemeVariant =
  configuredTheme && configuredTheme in themeVariants
    ? configuredTheme
    : "moonlitHatchery";

export const theme = themeVariants[ACTIVE_THEME];
export const colors = theme.colors;
export const radii = theme.radii;
export const spacing = theme.spacing;
export const typography = theme.typography;

export const elementColors = {
  leaf: colors.leaf,
  ember: colors.ember,
  tide: colors.tide,
  storm: colors.storm,
} as const;

export const rarityColors = {
  common: "#D8CBB8",
  uncommon: colors.leaf,
  rare: colors.tide,
  epic: colors.storm,
  legendary: colors.rewardGold,
} as const;

export const gameColors = {
  activeNavBackground: "#D9F7EF",
  disabled: "#CFC9BC",
  glowMint: "#D9F7EF",
  locked: "#CFC9BC",
  magicalHighlight: colors.accent,
  progressFill: colors.rewardGold,
  progressTrack: "#EAE5FF",
  secondaryButton: colors.primarySoft,
  success: colors.leaf,
} as const;
