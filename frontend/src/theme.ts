// Await design tokens. Light and dark share IDENTICAL geometry; only these values change.
import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dim" | "dark";

const light = {
  surface: "#F7F9FC",
  onSurface: "#0B1B31",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#0B1B31",
  surfaceTertiary: "#EEF3F9",
  onSurfaceTertiary: "#6B7B93",
  surfaceInverse: "#0B1B31",
  onSurfaceInverse: "#F7F9FC",
  muted: "#6B7B93",

  brand: "#168CFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#168CFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#0B5ED7",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E6F1FF",
  onBrandTertiary: "#168CFF",

  success: "#22C55E",
  onSuccess: "#FFFFFF",
  successTint: "#E6F8EC",
  warning: "#FFB020",
  onWarning: "#0B1B31",
  warningTint: "#FFF4DE",
  error: "#FF4D4D",
  onError: "#FFFFFF",
  errorTint: "#FFE8E8",
  info: "#168CFF",
  onInfo: "#FFFFFF",
  purple: "#7C5CFF",
  purpleTint: "#EFEBFF",

  border: "#DCE5EF",
  borderStrong: "#C5D3E3",
  divider: "#E7EEF6",
  overlay: "rgba(11,27,49,0.45)",
  tabInactive: "#8A9BB5",

  // Auth wallpaper is dark in both themes — these stay identical so the hero reads the same.
  onWallpaper: "#F7F9FC",
  onWallpaperMuted: "rgba(247,249,252,0.72)",
  wallpaperScrimTop: "rgba(7,17,31,0.10)",
  wallpaperScrimBottom: "rgba(7,17,31,0.94)",
  glass: "rgba(14,27,43,0.74)",
  glassBorder: "rgba(255,255,255,0.12)",
  // Google brand button (per Google Identity guidelines)
  google: "#FFFFFF",
  onGoogle: "#1F1F1F",
  googleBorder: "#747775",

  // App backdrop gradient (top → mid → bottom). Applied app-wide behind every screen.
  bgGradient: ["#FBFCFE", "#EEF3FA", "#E3ECF7"] as readonly string[],
};

const dark: typeof light = {
  surface: "#07111F",
  onSurface: "#F7F9FC",
  surfaceSecondary: "#0E1B2B",
  onSurfaceSecondary: "#F7F9FC",
  surfaceTertiary: "#152538",
  onSurfaceTertiary: "#91A4C3",
  surfaceInverse: "#F7F9FC",
  onSurfaceInverse: "#07111F",
  muted: "#91A4C3",

  brand: "#168CFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#168CFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#0B5ED7",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#10294A",
  onBrandTertiary: "#5FAFFF",

  success: "#22C55E",
  onSuccess: "#07111F",
  successTint: "#0F2E20",
  warning: "#FFB020",
  onWarning: "#07111F",
  warningTint: "#332A12",
  error: "#FF4D4D",
  onError: "#FFFFFF",
  errorTint: "#3A1A1F",
  info: "#168CFF",
  onInfo: "#FFFFFF",
  purple: "#9D86FF",
  purpleTint: "#241F45",

  border: "#21344C",
  borderStrong: "#2E4562",
  divider: "#1A2B40",
  overlay: "rgba(0,0,0,0.6)",
  tabInactive: "#6F84A3",

  onWallpaper: "#F7F9FC",
  onWallpaperMuted: "rgba(247,249,252,0.72)",
  wallpaperScrimTop: "rgba(7,17,31,0.10)",
  wallpaperScrimBottom: "rgba(7,17,31,0.94)",
  glass: "rgba(14,27,43,0.74)",
  glassBorder: "rgba(255,255,255,0.12)",
  google: "#FFFFFF",
  onGoogle: "#1F1F1F",
  googleBorder: "#747775",
  bgGradient: ["#0C1626", "#081120", "#04090F"] as readonly string[],
};

// Evening / "dim" — a softer, warmer dark for the transition between day and night.
const dim: typeof light = {
  ...dark,
  surface: "#141D30",
  onSurface: "#EDF2FA",
  surfaceSecondary: "#1C2740",
  onSurfaceSecondary: "#EDF2FA",
  surfaceTertiary: "#243350",
  onSurfaceTertiary: "#A6B6D4",
  surfaceInverse: "#EDF2FA",
  onSurfaceInverse: "#141D30",
  muted: "#A2B3D2",
  brandTertiary: "#17335A",
  onBrandTertiary: "#7CC0FF",
  successTint: "#123326",
  warningTint: "#39301A",
  errorTint: "#3E2026",
  purple: "#9D86FF",
  purpleTint: "#2A2350",
  border: "#2C3E5C",
  borderStrong: "#3A5176",
  divider: "#22324C",
  overlay: "rgba(4,10,20,0.55)",
  tabInactive: "#7C90B2",
  bgGradient: ["#2A3652", "#1C2740", "#141D30"] as readonly string[],
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dim: ThemeColors; dark: ThemeColors } = { light, dim, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;

let override: ColorScheme | null = null;
const listeners = new Set<() => void>();

export function setColorScheme(scheme: ColorScheme | null) {
  override = scheme;
  // Native Appearance only understands light/dark — map "dim" onto dark for OS-level chrome.
  Appearance.setColorScheme?.(scheme === "dim" ? "dark" : (scheme ?? "unspecified"));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const forced = useSyncExternalStore(subscribe, () => override, () => override);
  const scheme: ColorScheme = forced ?? (system === "dark" || system === "light" ? system : defaultScheme);
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
