import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

interface Props {
  children: ReactNode;
  subtitle?: string;
  title: string;
}

export function StackedMenuCard({ children, subtitle, title }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.stack}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  stack: {
    gap: 8,
  },
});
