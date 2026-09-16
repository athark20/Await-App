import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Field, Icon } from "@/src/components/ui";
import { LogoMark } from "@/src/components/Logo";
import { AuthBackdrop, AuthHeader, GoogleButton } from "@/src/components/AuthBackdrop";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";

export default function Register() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register, loginGoogle } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 6) return setError("Fill all fields. Password needs 6+ characters.");
    setBusy("email");
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? "Could not create account");
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
      <View style={[styles.root, { paddingTop: insets.top }]} testID="register-screen">
        <AuthHeader testID="register-back-button" />
        <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(500)} style={styles.brand}>
            <View style={styles.badge}>
              <LogoMark size={36} />
            </View>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>Follow up. Close the loop.</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.card}>
            <Field label="Full name" placeholder="Alex" value={name} onChangeText={setName} autoComplete="name" textContentType="name" returnKeyType="next" testID="register-name-input" />
            <Field label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" testID="register-email-input" />
            <View>
              <Field label="Password" placeholder="6+ characters" value={password} onChangeText={setPassword} secureTextEntry={!show} autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} testID="register-password-input" />
              <Pressable testID="register-toggle-password" onPress={() => setShow((s) => !s)} style={styles.eye} hitSlop={8}>
                <Icon name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
              </Pressable>
            </View>
            {error ? (
              <View style={styles.errorBox} testID="register-error">
                <Icon name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            <Button title="Create Account" icon="person-add-outline" onPress={submit} loading={busy === "email"} testID="register-submit-button" style={{ height: 46 }} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(500)} style={{ gap: 14 }}>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>
            <GoogleButton testID="register-google-button" onPress={google} busy={busy === "google"} label="Sign up with Google" />
            <Text style={styles.legal}>By continuing, you agree to our Terms of Service and Privacy Policy.</Text>
            <Pressable testID="register-signin-link" onPress={() => router.replace("/(auth)/login")} style={styles.signin}>
              <Text style={styles.footer}>
                Already have an account? <Text style={styles.footerStrong}>Sign in</Text>
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
  content: { paddingHorizontal: spacing.xl, gap: 20, paddingTop: 4 },
  brand: { alignItems: "center", gap: 6, marginBottom: 4 },
  badge: { width: 64, height: 64, borderRadius: 20, backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "800", color: c.onWallpaper, letterSpacing: -0.4 },
  subtitle: { fontSize: 14.5, color: c.onWallpaperMuted },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 14 },
  eye: { position: "absolute", right: 14, top: 36, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.errorTint, borderRadius: radius.sm, padding: 10 },
  error: { color: c.error, fontSize: 13.5, flex: 1 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: c.glassBorder },
  dividerText: { fontSize: 12.5, color: c.onWallpaperMuted },
  legal: { fontSize: 11.5, color: c.onWallpaperMuted, textAlign: "center", lineHeight: 16 },
  signin: { alignItems: "center", paddingVertical: 6 },
  footer: { color: c.onWallpaperMuted, fontSize: 13.5 },
  footerStrong: { color: c.warning, fontWeight: "700" },
}));
