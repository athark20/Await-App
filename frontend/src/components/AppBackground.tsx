import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme";
import { usePrefs, type Phase } from "@/src/prefs";

const WALLPAPERS: Record<Phase, any> = {
  morning: require("@/assets/wallpapers/morning.jpg"),
  afternoon: require("@/assets/wallpapers/afternoon.jpg"),
  dusk: require("@/assets/wallpapers/dusk.jpg"),
  night: require("@/assets/wallpapers/night.jpg"),
};

// Scrim base (matches each phase's surface tone) so cards + text stay readable while the sky shows through.
const SCRIM: Record<Phase, string> = {
  morning: "247,249,252",
  afternoon: "247,249,252",
  dusk: "20,29,48",
  night: "7,17,31",
};

/**
 * App-wide backdrop. A crisp photographic sky wallpaper that changes with the time of day,
 * under a soft gradient scrim (stronger at the top/bottom edges, light in the middle) so
 * content stays legible while the wallpaper reads clearly. Screens render transparently on top.
 */
export function AppBackground() {
  const { scheme } = useTheme();
  const { phase } = usePrefs();
  const p: Phase = phase === "system" ? (scheme === "dark" ? "night" : "afternoon") : phase;
  const base = SCRIM[p];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image key={p} source={WALLPAPERS[p]} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={[`rgba(${base},0.42)`, `rgba(${base},0.06)`, `rgba(${base},0.44)`]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
