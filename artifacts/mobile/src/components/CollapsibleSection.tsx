import { useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii } from "../theme";

interface Props {
  badge?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  title: string;
}

export function CollapsibleSection({
  badge,
  children,
  defaultOpen = false,
  style,
  subtitle,
  title,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={[styles.section, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.meta}>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
          <Text style={styles.chevron}>{open ? "Hide" : "Show"}</Text>
        </View>
      </Pressable>
      {open ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.translucentSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.75,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  meta: {
    alignItems: "flex-end",
    gap: 5,
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chevron: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  content: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    backgroundColor: colors.surface,
    padding: 12,
  },
});
