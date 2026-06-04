import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { capitalize, getRarityColor } from "@/constants/rarity";
import { useColors } from "@/hooks/useColors";

type IconName = React.ComponentProps<typeof Feather>["name"];

const ELEMENT_COLORS: Record<string, string> = {
  air: "#38bdf8",
  dark: "#64748b",
  earth: "#a16207",
  electric: "#facc15",
  fire: "#f97316",
  light: "#fde68a",
  nature: "#22c55e",
  normal: "#94a3b8",
  storm: "#a855f7",
  tide: "#0ea5e9",
  water: "#0ea5e9",
};

const ELEMENT_ICONS: Record<string, IconName> = {
  air: "wind",
  dark: "moon",
  earth: "layers",
  electric: "zap",
  fire: "zap",
  light: "sun",
  nature: "feather",
  normal: "circle",
  storm: "cloud-lightning",
  tide: "droplet",
  water: "droplet",
};

export interface GameCardProps {
  children: React.ReactNode;
  accentColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GameCard({ children, accentColor, onPress, style, testID }: GameCardProps) {
  const colors = useColors();
  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.card,
      borderColor: accentColor ? `${accentColor}66` : colors.border,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={cardStyle} testID={testID}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle} testID={testID}>
      {children}
    </View>
  );
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({ title, subtitle, onBack, right, style }: ScreenHeaderProps) {
  const colors = useColors();

  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerLeft}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}

export function RarityPill({ rarity }: { rarity?: string | null }) {
  const color = getRarityColor(rarity);
  return (
    <View style={[styles.pill, { backgroundColor: `${color}28`, borderColor: `${color}66` }]}>
      <Text style={[styles.pillText, { color }]}>{capitalize(rarity ?? "common")}</Text>
    </View>
  );
}

export function ElementBadge({ element }: { element?: string | null }) {
  const colors = useColors();
  const key = (element ?? "normal").toLowerCase();
  const color = ELEMENT_COLORS[key] ?? ELEMENT_COLORS.normal;
  const icon = ELEMENT_ICONS[key] ?? ELEMENT_ICONS.normal;

  return (
    <View style={[styles.elementBadge, { backgroundColor: `${color}22`, borderColor: `${color}66` }]}>
      <Feather name={icon} size={11} color={color} />
      <Text style={[styles.elementText, { color: colors.foreground }]}>{capitalize(key)}</Text>
    </View>
  );
}

export interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ value, max = 100, color, height = 6, style }: ProgressBarProps) {
  const colors = useColors();
  const pct = Math.max(0, Math.min(1, value / Math.max(max, 1)));
  const fillColor = color ?? colors.primary;

  return (
    <View
      style={[
        styles.progressTrack,
        { backgroundColor: colors.border, height, borderRadius: height / 2 },
        style,
      ]}
    >
      <View
        style={[
          styles.progressFill,
          {
            backgroundColor: fillColor,
            height,
            borderRadius: height / 2,
            width: `${pct * 100}%` as `${number}%`,
          },
        ]}
      />
    </View>
  );
}

export interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

export function StatBar({ label, value, max = 100, color }: StatBarProps) {
  const colors = useColors();

  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <ProgressBar value={value} max={max} color={color} height={7} />
      <Text style={[styles.statValue, { color: colors.foreground }]}>{Math.round(value)}</Text>
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ title, description, icon = "star", action, style }: EmptyStateProps) {
  const colors = useColors();

  return (
    <GameCard style={[styles.emptyState, style]}>
      <Feather name={icon} size={38} color={colors.mutedForeground} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>{description}</Text>
      ) : null}
      {action}
    </GameCard>
  );
}

export interface PrimaryCTAProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PrimaryCTA({
  label,
  onPress,
  icon,
  loading,
  disabled,
  color = "#ee2b8c",
  style,
  testID,
}: PrimaryCTAProps) {
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={[styles.cta, { backgroundColor: color, opacity: disabled || loading ? 0.6 : 1 }, style]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          {icon ? <Feather name={icon} size={16} color="#fff" /> : null}
          <Text style={styles.ctaText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: { padding: 6 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  cta: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  elementBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  elementText: { fontSize: 11, fontWeight: "700" },
  emptyDescription: { fontSize: 12, lineHeight: 17, textAlign: "center" },
  emptyState: { alignItems: "center", gap: 8, padding: 28 },
  emptyTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerLeft: { alignItems: "center", flexDirection: "row", flex: 1, gap: 8 },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  headerTextBlock: { flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: { fontSize: 11, fontWeight: "800" },
  progressFill: {},
  progressTrack: { flex: 1, overflow: "hidden" },
  statLabel: { fontSize: 12, width: 82 },
  statRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  statValue: { fontSize: 12, fontWeight: "700", textAlign: "right", width: 32 },
});
