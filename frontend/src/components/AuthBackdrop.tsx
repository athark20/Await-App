import React from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme";
import { GoogleG } from "@/src/components/GoogleG";

const wallpaper = require("../../assets/images/auth-wallpaper.png");

// Shared auth-screen backdrop: the Await wallpaper (theme-invariant) plus a gradient scrim
// so copy and buttons stay legible. `dim` deepens the scrim for form-heavy screens.
export function AuthBackdrop({ children, dim = 0 }: { children: React.ReactNode; dim?: number }) {
  const { colors } = useTheme();
  return (
    <ImageBackground source={wallpaper} style={styles.fill} imageStyle={styles.fill100} resizeMode="cover" testID="auth-wallpaper">
      <LinearGradient
        colors={[colors.wallpaperScrimTop, `rgba(7,17,31,${Math.min(0.95, 0.35 + dim)})`, colors.wallpaperScrimBottom]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </ImageBackground>
  );
}

// "Sign in with Google" per Google's brand guidelines: white surface, neutral border, dark label, full-colour G.
export function GoogleButton({ onPress, busy, label = "Continue with Google", testID }: { onPress: () => void; busy?: boolean; label?: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.btn, { backgroundColor: colors.google, borderColor: colors.googleBorder }, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.g}>
        <GoogleG size={20} />
      </View>
      <Text style={[styles.label, { color: colors.onGoogle }]}>{busy ? "Please wait…" : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fill100: { width: "100%", height: "100%" },
  btn: { height: 52, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  g: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15.5, fontWeight: "600", letterSpacing: 0.1 },
});
