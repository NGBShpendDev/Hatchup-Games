export const themeVariants = {
  default: {
    colors: {
      background: "#F8F4EC",
      surface: "#FFFFFF",
      ink: "#25312E",
      muted: "#6E7B77",
      line: "#E7DED2",
      primary: "#147D6F",
      primaryDeep: "#0F5E55",
      primarySoft: "#DDF2EC",
      accent: "#F4A340",
      accentSoft: "#FFF0D8",
      softPeach: "#FFF0D8",
      softBlue: "#E6F1FA",
      softLavender: "#F0E8FA",
      rewardGold: "#F4A340",
      danger: "#B24B4B",
      dangerSoft: "#F8E2E2",
      warmSurface: "#FFF0D8",
      cardShadow: "rgba(37, 49, 46, 0.08)",
      cardShadowStrong: "rgba(37, 49, 46, 0.14)",
      modalBackdrop: "rgba(37, 49, 46, 0.62)",
      translucentSurface: "rgba(255, 255, 255, 0.72)",
      avatarBorder: "rgba(37, 49, 46, 0.15)",
      leaf: "#51A897",
      ember: "#F4A340",
      tide: "#547DC6",
      storm: "#9A64C7",
      egg: "#E5B05D",
      baby: "#51A897",
      teen: "#547DC6",
      final: "#9A64C7",
    },
    radii: {
      button: 16,
      card: 18,
      hero: 22,
      pill: 999,
    },
    spacing: {
      screen: 20,
      card: 16,
      section: 22,
      footerBottom: 28,
    },
    typography: {
      titleWeight: "900" as const,
      bodyLineHeight: 22,
    },
  },
  premiumGarden: {
    colors: {
      background: "#FBF4E6",
      surface: "#FFFFFF",
      ink: "#20312A",
      muted: "#718078",
      line: "#EADCC8",
      primary: "#0B6F5C",
      primaryDeep: "#064E43",
      primarySoft: "#DDF4EC",
      accent: "#E8B84A",
      accentSoft: "#FFF3D8",
      softPeach: "#FFE5CC",
      softBlue: "#E3F5FF",
      softLavender: "#EFE8FF",
      rewardGold: "#E8B84A",
      danger: "#A94646",
      dangerSoft: "#F8E2E2",
      warmSurface: "#FFF3D8",
      cardShadow: "rgba(6, 78, 67, 0.10)",
      cardShadowStrong: "rgba(6, 78, 67, 0.16)",
      modalBackdrop: "rgba(6, 78, 67, 0.62)",
      translucentSurface: "rgba(255, 255, 255, 0.78)",
      avatarBorder: "rgba(6, 78, 67, 0.16)",
      leaf: "#79A66A",
      ember: "#FF9B5F",
      tide: "#63C7E8",
      storm: "#B8A4F6",
      egg: "#E8B84A",
      baby: "#79A66A",
      teen: "#63C7E8",
      final: "#B8A4F6",
    },
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
      footerBottom: 28,
    },
    typography: {
      titleWeight: "900" as const,
      bodyLineHeight: 23,
    },
  },
  creatureAdventure: {
    colors: {
      background: "#FFF6E8",
      surface: "#FFFFFF",
      ink: "#1C2E29",
      muted: "#6D7B75",
      line: "#E8D8C4",
      primary: "#116A5B",
      primaryDeep: "#0B3D35",
      primarySoft: "#DDF6EF",
      accent: "#F4C542",
      accentSoft: "#FFF0D8",
      softPeach: "#FFE1C7",
      softBlue: "#DDF3FF",
      softLavender: "#EEE6FF",
      rewardGold: "#F4C542",
      danger: "#D95C5C",
      dangerSoft: "#FFE3E3",
      warmSurface: "#FFF0D8",
      cardShadow: "rgba(11, 61, 53, 0.11)",
      cardShadowStrong: "rgba(11, 61, 53, 0.20)",
      modalBackdrop: "rgba(11, 61, 53, 0.68)",
      translucentSurface: "rgba(255, 255, 255, 0.82)",
      avatarBorder: "rgba(11, 61, 53, 0.18)",
      leaf: "#5DBB63",
      ember: "#FF8A3D",
      tide: "#42BDEB",
      storm: "#A78BFA",
      egg: "#F4C542",
      baby: "#5DBB63",
      teen: "#42BDEB",
      final: "#A78BFA",
    },
    radii: {
      button: 20,
      card: 24,
      hero: 30,
      pill: 999,
    },
    spacing: {
      screen: 20,
      card: 18,
      section: 24,
      footerBottom: 30,
    },
    typography: {
      titleWeight: "900" as const,
      bodyLineHeight: 23,
    },
  },
} as const;

export type ThemeVariant = keyof typeof themeVariants;

// Rollback switch:
// - Use EXPO_PUBLIC_HATCHUP_THEME=default to restore the original palette.
// - Or change ACTIVE_THEME below from "creatureAdventure" to "default".
const configuredTheme = process.env.EXPO_PUBLIC_HATCHUP_THEME as
  | ThemeVariant
  | undefined;
export const ACTIVE_THEME: ThemeVariant =
  configuredTheme && configuredTheme in themeVariants
    ? configuredTheme
    : "creatureAdventure";

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
