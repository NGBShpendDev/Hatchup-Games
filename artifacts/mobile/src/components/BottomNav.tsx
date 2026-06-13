import {
  Egg,
  House,
  LayoutGrid,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ENABLE_LEADERBOARD } from "../config/features";
import { getEggProgress, isEggReady } from "../domain/hatchery";
import {
  getActiveHatchling,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "../domain/hatchlings";
import { colors, radii } from "../theme";
import { ActiveTabTransition } from "../utils/animations";
import { formatPercent } from "../utils/format";
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
      {data && <MiniStatusBar data={data} />}
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
          color={active ? colors.surface : colors.muted}
          size={19}
          strokeWidth={active ? 2.7 : 2.3}
        />
      </ActiveTabTransition>
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

function MiniStatusBar({
  data,
}: {
  data: NonNullable<ReturnType<typeof useBottomNavStatusData>>;
}) {
  const activePalRaw = getActiveHatchling(data);
  const activePal = activePalRaw ? getTimeAdjustedHatchling(activePalRaw) : null;
  const training = activePal ? getTrainingStatus(activePal) : null;
  const closestEgg =
    data.activeEggs
      .filter((egg) => !isEggReady(egg))
      .sort((left, right) => getEggProgress(right) - getEggProgress(left))[0] ??
    data.activeEggs[0] ??
    null;

  return (
    <View style={styles.statusBar}>
      <View style={styles.statusItemWide}>
        <Text style={styles.statusLabel}>Active Pal</Text>
        <Text numberOfLines={1} style={styles.statusValue}>
          {activePal ? `${activePal.name} L${activePal.level}` : "Hatch one"}
        </Text>
      </View>
      <View style={styles.statusDivider} />
      <View style={styles.statusItem}>
        <Text style={styles.statusLabel}>Training</Text>
        <Text style={styles.statusValue}>
          {training ? `${training.remainingToday} left` : "Hatch Pal"}
        </Text>
      </View>
      <View style={styles.statusDivider} />
      <View style={styles.statusItem}>
        <Text style={styles.statusLabel}>Egg</Text>
        <Text style={styles.statusValue}>
          {closestEgg ? formatPercent(getEggProgress(closestEgg)) : "None"}
        </Text>
      </View>
    </View>
  );
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
    paddingHorizontal: 11,
    paddingVertical: 7,
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
    backgroundColor: colors.primarySoft,
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
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
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
