import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii } from "../theme";

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
        props.disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant !== "primary" && styles.darkLabel,
          props.disabled && styles.disabledLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radii.button,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 20,
    shadowColor: colors.cardShadow,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.75,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  darkLabel: {
    color: colors.primaryDeep,
  },
  disabled: {
    backgroundColor: colors.line,
    borderColor: colors.line,
    shadowOpacity: 0,
  },
  disabledLabel: {
    color: colors.muted,
  },
});
