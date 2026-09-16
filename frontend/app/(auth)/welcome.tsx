import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";
import { AnimatedLogoMark } from "@/src/components/AnimatedLogo";
import { AuthBackdrop, GoogleButton } from "@/src/components/AuthBackdrop";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";

export default function Welcome() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loginGoogle, continueAsGuest } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast.show(e?.message ?? "Something went wrong", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthBackdrop>
      <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]} testID="welcome-screen">
        <Animated.View entering={FadeInUp.duration(600)} style={styles.wordmark}>
          <AnimatedLogoMark size={28} />
          <Text style={styles.wordmarkText}>Await</Text>
        </Animated.View>

        <View style={styles.hero}>
          <Animated.Text entering={FadeInDown.delay(500).duration(600)} style={styles.title}>
            Never chase{"\n"}a promise twice.
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(700).duration(600)} style={styles.tagline}>
            Refunds, parcels, documents, quotes — Await remembers who owes you what, and nudges you when it matters.
          </Animated.Text>
        </View>

        <Animated.View entering={FadeInDown.delay(950).duration(600)} style={styles.actions}>
          <GoogleButton testID="welcome-google-button" onPress={() => run("g", loginGoogle)} busy={busy === "g"} />
          <Pressable testID="welcome-email-button" onPress={() => router.push("/(auth)/register")} style={({ pressed }) => [styles.emailBtn, pressed && { opacity: 0.9 }]}>
            <Icon name="mail-outline" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.emailText}>Continue with Email</Text>
          </Pressable>
          <Pressable testID="welcome-guest-button" onPress={() => run("guest", continueAsGuest)} style={styles.guest}>
            <Text style={styles.guestText}>{busy === "guest" ? "Setting up…" : "Skip for now"}</Text>
          </Pressable>
          <Text style={styles.legal}>By continuing, you agree to our Terms of Service and Privacy Policy.</Text>
          <Pressable testID="welcome-signin-link" onPress={() => router.push("/(auth)/login")} hitSlop={8}>
            <Text style={styles.signin}>
              I already have an account <Text style={styles.signinStrong}>Sign in</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </AuthBackdrop>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, paddingHorizontal: spacing.xxl, justifyContent: "space-between" },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 10 },
  wordmarkText: { fontSize: 20, fontWeight: "800", color: c.onWallpaper, letterSpacing: -0.3 },
  hero: { flex: 1, justifyContent: "flex-end", gap: 12, paddingBottom: 28 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: "800", color: c.onWallpaper, letterSpacing: -0.6 },
  tagline: { fontSize: 15.5, lineHeight: 22, color: c.onWallpaperMuted },
  actions: { gap: 12 },
  emailBtn: { height: 52, borderRadius: radius.md, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  emailText: { fontSize: 15.5, fontWeight: "700", color: c.onBrandPrimary },
  guest: { height: 44, alignItems: "center", justifyContent: "center" },
  guestText: { color: c.onWallpaper, fontWeight: "600", fontSize: 15 },
  legal: { fontSize: 11.5, color: c.onWallpaperMuted, textAlign: "center", lineHeight: 16 },
  signin: { textAlign: "center", color: c.onWallpaperMuted, fontSize: 13.5, marginTop: 4 },
  signinStrong: { color: c.warning, fontWeight: "700" },
}));
