import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

interface Props {
  active: "home" | "monster" | "settings";
  onHomePress: () => void;
  onMonsterPress: () => void;
  onSettingsPress: () => void;
}

export function BottomNav({
  active,
  onHomePress,
  onMonsterPress,
  onSettingsPress,
}: Props) {
  return (
    <View style={styles.nav}>
      <NavItem active={active === "home"} label="Home" onPress={onHomePress} />
      <NavItem
        active={active === "monster"}
        label="Hatchery"
        onPress={onMonsterPress}
      />
      <NavItem
        active={active === "settings"}
        label="Settings"
        onPress={onSettingsPress}
      />
    </View>
  );
}

function NavItem({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.item}>
      <View style={[styles.dot, active && styles.activeDot]} />
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
    minWidth: 80,
  },
  dot: {
    backgroundColor: colors.line,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  activeDot: {
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  activeLabel: {
    color: colors.primary,
  },
});
