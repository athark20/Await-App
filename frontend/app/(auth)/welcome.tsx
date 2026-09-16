import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";
import { AnimatedLogoMark } from "@/src/components/AnimatedLogo";
import LottieView from "lottie-react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";

const orbit = require("../../assets/lottie/await-orbit.json");

export default function Welcome() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loginGoogle, continueAsGuest } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { colors } = useTheme();

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
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]} testID="welcome-screen">
      <View style={styles.hero}>
        <View style={styles.stage}>
          <View testID="welcome-lottie" style={styles.lottie} pointerEvents="none">
            <LottieView source={orbit} autoPlay loop style={{ width: 260, height: 260 }} />
          </View>
          <Animated.View entering={FadeInUp.duration(600)} style={styles.logoBadge}>
            <AnimatedLogoMark size={64} />
          </Animated.View>
        </View>
        <Animated.Text entering={FadeInDown.delay(900).duration(500)} style={styles.title}>
          Await
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(1100).duration(500)} style={styles.tagline}>
          Track it. Follow up. Get it done.
        </Animated.Text>
      </View>

      <Animated.View entering={FadeInDown.delay(1300).duration(600)} style={styles.actions}>
        <AuthButton testID="welcome-google-button" icon="logo-google" label="Continue with Google" onPress={() => run("g", loginGoogle)} busy={busy === "g"} />
        <AuthButton testID="welcome-email-button" icon="mail-outline" label="Continue with Email" onPress={() => router.push("/(auth)/register")} />
        <Pressable testID="welcome-guest-button" onPress={() => run("guest", continueAsGuest)} style={styles.guest}>
          <Text style={styles.guestText}>{busy === "guest" ? "Setting up…" : "Skip for now"}</Text>
        </Pressable>
        <Text style={styles.legal}>By continuing, you agree to our Terms of Service and Privacy Policy.</Text>
        <Pressable testID="welcome-signin-link" onPress={() => router.push("/(auth)/login")} hitSlop={8}>
          <Text style={styles.signin}>
            I already have an account <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Sign in</Text>
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function AuthButton({ icon, label, onPress, busy, testID }: { icon: string; label: string; onPress: () => void; busy?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={busy} style={({ pressed }) => [styles.authBtn, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={20} color={colors.onSurface} />
      <Text style={styles.authLabel}>{busy ? "Please wait…" : label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, paddingHorizontal: spacing.xxl, justifyContent: "space-between" },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  stage: { width: 260, height: 260, alignItems: "center", justifyContent: "center", marginBottom: -20 },
  lottie: { position: "absolute", width: 260, height: 260 },
  logoBadge: { width: 112, height: 112, borderRadius: 32, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 36, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: c.muted },
  actions: { gap: 12 },
  authBtn: { height: 52, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  authLabel: { fontSize: 15.5, fontWeight: "700", color: c.onSurface },
  guest: { height: 44, alignItems: "center", justifyContent: "center" },
  guestText: { color: c.brandPrimary, fontWeight: "600", fontSize: 15 },
  legal: { fontSize: 11.5, color: c.muted, textAlign: "center", lineHeight: 16 },
  signin: { textAlign: "center", color: c.muted, fontSize: 13.5, marginTop: 4 },
}));
