import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

interface GlowCardProps {
  children: React.ReactNode;
  glowColor?: string;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
  intensity?: "low" | "medium" | "high";
}

export function GlowCard({
  children,
  glowColor,
  style,
  innerStyle,
  intensity = "medium",
}: GlowCardProps) {
  const colors = useColors();
  const color = glowColor ?? colors.primary;

  const glowOpacity = intensity === "low" ? 0.12 : intensity === "medium" ? 0.22 : 0.4;
  const glowHex = color + Math.round(glowOpacity * 255).toString(16).padStart(2, "0");

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: color + "44",
          boxShadow: `0 0 16px ${glowHex}, 0 2px 8px rgba(0,0,0,0.4)`,
        } as any,
        style,
      ]}
    >
      <View style={innerStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
  },
});
