import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

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
  return (
    <View style={styles.nav}>
      <NavItem active={active === "home"} icon="H" label="Home" onPress={onHomePress} />
      <NavItem
        active={active === "monster"}
        icon="E"
        label="Hatchery"
        onPress={onMonsterPress}
      />
      <NavItem
        active={active === "dex"}
        icon="C"
        label="Collection"
        onPress={onDexPress}
      />
      <NavItem
        active={active === "leaderboard"}
        icon="R"
        label="Ranks"
        onPress={onLeaderboardPress}
      />
      <NavItem
        active={active === "settings"}
        icon="P"
        label="Profile"
        onPress={onSettingsPress}
      />
    </View>
  );
}

function NavItem({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.item}>
      <View style={[styles.iconWrap, active && styles.activeIconWrap]}>
        <Text style={[styles.icon, active && styles.activeIcon]}>{icon}</Text>
      </View>
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
  },
  item: {
    alignItems: "center",
    gap: 5,
    minWidth: 54,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.line,
    borderRadius: 9,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  activeIconWrap: {
    backgroundColor: colors.primary,
  },
  icon: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
  },
  activeIcon: {
    color: "#FFFFFF",
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  activeLabel: {
    color: colors.primary,
  },
});
