import {
  Egg,
  House,
  LayoutGrid,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ENABLE_LEADERBOARD } from "../config/features";
import { toDateKey } from "../domain/date";
import { getEggProgressSummary, getTrackedEgg } from "../domain/eggProgress";
import {
  getActiveHatchling,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "../domain/hatchlings";
import { getNextBestAction, getSyncedAwardForDate } from "../domain/nextBestAction";
import { colors, gameColors, radii } from "../theme";
import { ActiveTabTransition } from "../utils/animations";
import { useBottomNavStatusData } from "./BottomNavStatusContext";

interface Props {
  active: "home" | "monster" | "dex" | "leaderboard" | "settings";
  onDexPress: () => void;
  onHomePress: () => void;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onSettingsPress: () => void;
}

export function BottomNav({
  active,
  onDexPress,
  onHomePress,
  onLeaderboardPress,
  onMonsterPress,
  onSettingsPress,
}: Props) {
  const data = useBottomNavStatusData();
  const [statusCollapsed, setStatusCollapsed] = useState(false);
  const items: NavItemConfig[] = [
    {
      accessibilityLabel: "Go to Home",
      active: active === "home",
      Icon: House,
      label: "Home",
      onPress: onHomePress,
    },
    {
      accessibilityLabel: "Go to Hatchery",
      active: active === "monster",
      Icon: Egg,
      label: "Hatchery",
      onPress: onMonsterPress,
    },
    {
      accessibilityLabel: "Go to Collection",
      active: active === "dex",
      Icon: LayoutGrid,
      label: "Collection",
      onPress: onDexPress,
    },
    ...(ENABLE_LEADERBOARD
      ? [
          {
            accessibilityLabel: "Go to Ranks",
            active: active === "leaderboard",
            Icon: Trophy,
            label: "Ranks",
            onPress: onLeaderboardPress,
          },
        ]
      : []),
    {
      accessibilityLabel: "Go to Profile",
      active: active === "settings",
      Icon: User,
      label: "Profile",
      onPress: onSettingsPress,
    },
  ];

  return (
    <View style={styles.footerStack}>
      {data && (
        <MiniStatusBar
          collapsed={statusCollapsed}
          data={data}
          onToggle={() => setStatusCollapsed((current) => !current)}
        />
      )}
      <View style={styles.nav}>
        {items.map((item) => (
          <NavItem key={item.label} {...item} />
        ))}
      </View>
    </View>
  );
}

interface NavItemConfig {
  accessibilityLabel: string;
  active: boolean;
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}

function NavItem({
  accessibilityLabel,
  active,
  Icon,
  label,
  onPress,
}: NavItemConfig) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        active && styles.activeItem,
        pressed && styles.pressedItem,
      ]}
    >
      <ActiveTabTransition
        active={active}
        style={[styles.iconWrap, active && styles.activeIconWrap]}
      >
        <Icon
          color={active ? colors.primaryDeep : colors.muted}
          size={19}
          strokeWidth={active ? 2.7 : 2.3}
        />
      </ActiveTabTransition>
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

function MiniStatusBar({
  collapsed,
  data,
  onToggle,
}: {
  collapsed: boolean;
  data: NonNullable<ReturnType<typeof useBottomNavStatusData>>;
  onToggle: () => void;
}) {
  const activePalRaw = getActiveHatchling(data);
  const activePal = activePalRaw ? getTimeAdjustedHatchling(activePalRaw) : null;
  const training = activePal ? getTrainingStatus(activePal) : null;
  const closestEgg = getTrackedEgg(
    data.activeEggs.length > 0 ? data.activeEggs : [data.activeEgg],
  );
  const eggSummary = closestEgg ? getEggProgressSummary(closestEgg) : null;
  const todayKey = toDateKey(new Date());
  const nextAction = getNextBestAction(data, { todayKey });
  const syncedToday = Boolean(getSyncedAwardForDate(data, todayKey));

  const activePalLabel = activePal ? `${activePal.name} L${activePal.level}` : "Hatch one";
  const trainingLabel = getStickyTrainingLabel({
    nextActionTarget: nextAction.target,
    syncedToday,
    trainingRemaining: training?.remainingToday,
  });
  const eggLabel = eggSummary
    ? eggSummary.isReady
      ? "Ready"
      : `${eggSummary.percentLabel} | ${eggSummary.stepsLeftLabel}`
    : "None";

  if (collapsed) {
    return (
      <Pressable
        accessibilityLabel="Show active Pal status"
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.statusBar,
          styles.statusBarCompact,
          pressed && styles.pressedItem,
        ]}
      >
        <Text numberOfLines={1} style={styles.statusCompactText}>
          {activePalLabel} · {trainingLabel} · Egg {eggLabel}
        </Text>
        <Text style={styles.statusToggle}>Show</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel="Hide active Pal status"
      accessibilityRole="button"
      onPress={onToggle}
      style={({ pressed }) => [
        styles.statusBar,
        pressed && styles.pressedItem,
      ]}
    >
      <View style={styles.statusItemWide}>
        <Text style={styles.statusLabel}>Active Pal</Text>
        <Text numberOfLines={1} style={styles.statusValue}>
          {activePalLabel}
        </Text>
      </View>
      <View style={styles.statusDivider} />
      <View style={styles.statusItem}>
        <Text style={styles.statusLabel}>Training</Text>
        <Text style={styles.statusValue}>
          {trainingLabel}
        </Text>
      </View>
      <View style={styles.statusDivider} />
      <View style={styles.statusItem}>
        <Text style={styles.statusLabel}>Egg</Text>
        <Text numberOfLines={1} style={styles.statusValue}>
          {eggLabel}
        </Text>
      </View>
      <Text style={styles.statusToggle}>Hide</Text>
    </Pressable>
  );
}

function getStickyTrainingLabel({
  nextActionTarget,
  syncedToday,
  trainingRemaining,
}: {
  nextActionTarget: ReturnType<typeof getNextBestAction>["target"];
  syncedToday: boolean;
  trainingRemaining: number | undefined;
}) {
  if (!syncedToday && nextActionTarget === "sync") return "Sync first";
  if (nextActionTarget === "hatchery") return "Hatch first";
  if (typeof trainingRemaining === "number") return `${trainingRemaining} left`;
  return "Hatch Pal";
}

const styles = StyleSheet.create({
  footerStack: {
    gap: 7,
  },
  statusBar: {
    alignItems: "center",
    backgroundColor: colors.translucentSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusBarCompact: {
    paddingVertical: 6,
  },
  statusCompactText: {
    color: colors.primaryDeep,
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
  },
  statusItem: {
    flex: 0.75,
  },
  statusItemWide: {
    flex: 1.2,
  },
  statusDivider: {
    backgroundColor: colors.line,
    height: 24,
    width: 1,
  },
  statusLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  statusValue: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },
  statusToggle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  nav: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.hero,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "space-between",
    paddingHorizontal: 7,
    paddingVertical: 6,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  item: {
    alignItems: "center",
    borderRadius: radii.card,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: 3,
    paddingVertical: 5,
  },
  activeItem: {
    backgroundColor: gameColors.activeNavBackground,
  },
  pressedItem: {
    opacity: 0.72,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 29,
    justifyContent: "center",
    width: 29,
  },
  activeIconWrap: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  activeLabel: {
    color: colors.primaryDeep,
    fontWeight: "900",
  },
});
