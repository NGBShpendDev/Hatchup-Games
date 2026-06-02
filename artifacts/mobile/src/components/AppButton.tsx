import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "../theme";

interface Props extends PressableProps {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  style?: StyleProp<ViewStyle>;
}

export function AppButton({ label, style, variant = "primary", ...props }: Props) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, variant !== "primary" && styles.darkLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 18,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
  },
  danger: {
    backgroundColor: "#F8E2E2",
  },
  pressed: {
    opacity: 0.75,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  darkLabel: {
    color: colors.ink,
  },
});
