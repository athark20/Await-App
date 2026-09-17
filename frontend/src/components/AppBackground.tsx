import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme";

/**
 * App-wide backdrop. A soft vertical gradient (per theme) sits behind every screen so the
 * background is never a flat white/dark fill. Screens render transparently on top of it.
 */
export function AppBackground() {
  const { colors, scheme } = useTheme();
  return (
    <LinearGradient
      key={scheme}
      colors={colors.bgGradient as [string, string, ...string[]]}
      locations={[0, 0.55, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
