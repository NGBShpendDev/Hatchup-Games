import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";

interface GradientButtonProps {
  onPress: () => void;
  label: string;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  variant?: "primary" | "success" | "danger";
  testID?: string;
}

const GRADIENT_COLORS: Record<string, [string, string]> = {
  primary: ["#ee2b8c", "#dc2626"],
  success: ["#22c55e", "#16a34a"],
  danger: ["#ef4444", "#b91c1c"],
};

export function GradientButton({
  onPress,
  label,
  icon,
  loading = false,
  disabled = false,
  style,
  variant = "primary",
  testID,
}: GradientButtonProps) {
  const colors = GRADIENT_COLORS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.wrapper, disabled && styles.disabled, style]}
      testID={testID}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            {icon}
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 4px 16px rgba(238,43,140,0.35)",
  } as any,
  disabled: { opacity: 0.55 },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
