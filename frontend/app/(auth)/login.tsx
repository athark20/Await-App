import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Field, Icon } from "@/src/components/ui";
import { LogoMark } from "@/src/components/Logo";
import { AuthBackdrop, GoogleButton } from "@/src/components/AuthBackdrop";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";

export default function Login() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loginEmail, loginGoogle } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy("email");
    try {
      await loginEmail(email.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? "Sign in failed");
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setBusy("google");
    try {
      await loginGoogle();
    } catch (e: any) {
      toast.show(e?.message ?? "Google sign-in failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthBackdrop dim={0.3}>
      <View style={[styles.root, { paddingTop: insets.top }]} testID="login-screen">
        <View style={styles.header}>
          <Pressable testID="login-back-button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(auth)/welcome"))} style={styles.back} hitSlop={8}>
            <Icon name="arrow-back" size={22} color={colors.onWallpaper} />
          </Pressable>
        </View>
        <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(500)} style={styles.brand}>
            <View style={styles.badge}>
              <LogoMark size={36} />
            </View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to pick up where you left off.</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.card}>
            <Field label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" testID="login-email-input" />
            <View>
              <Field label="Password" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry={!show} autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} testID="login-password-input" />
              <Pressable testID="login-toggle-password" onPress={() => setShow((s) => !s)} style={styles.eye} hitSlop={8}>
                <Icon name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
              </Pressable>
            </View>
            <Pressable testID="login-forgot-link" onPress={() => router.push("/(auth)/forgot")} style={{ alignSelf: "flex-end" }}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
            {error ? (
              <View style={styles.errorBox} testID="login-error">
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            <Button title="Sign In" icon="log-in-outline" onPress={submit} loading={busy === "email"} testID="login-submit-button" />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(500)} style={{ gap: 14 }}>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>
            <GoogleButton testID="login-google-button" onPress={google} busy={busy === "google"} label="Sign in with Google" />
            <Pressable testID="login-signup-link" onPress={() => router.replace("/(auth)/register")} style={styles.signup}>
              <Text style={styles.footer}>
                Don’t have an account? <Text style={styles.footerStrong}>Create one</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </KeyboardAwareScrollView>
      </View>
    </AuthBackdrop>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1 },
  header: { height: 52, paddingHorizontal: spacing.md, justifyContent: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  content: { paddingHorizontal: spacing.xl, gap: 20, paddingTop: 12 },
  brand: { alignItems: "center", gap: 6, marginBottom: 4 },
  badge: { width: 64, height: 64, borderRadius: 20, backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "800", color: c.onWallpaper, letterSpacing: -0.4 },
  subtitle: { fontSize: 14.5, color: c.onWallpaperMuted },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 14 },
  eye: { position: "absolute", right: 14, top: 36, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: 13.5 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.errorTint, borderRadius: radius.sm, padding: 10 },
  error: { color: c.error, fontSize: 13.5, flex: 1 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: c.glassBorder },
  dividerText: { fontSize: 12.5, color: c.onWallpaperMuted },
  signup: { alignItems: "center", paddingVertical: 8 },
  footer: { color: c.onWallpaperMuted, fontSize: 13.5 },
  footerStrong: { color: c.warning, fontWeight: "700" },
}));
