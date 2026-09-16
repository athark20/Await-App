import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Field, Icon } from "@/src/components/ui";
import { AuthBackdrop, AuthHeader } from "@/src/components/AuthBackdrop";
import { api, setToken, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";

export default function Forgot() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { setUser } = useAuth();
  const { colors } = useTheme();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/forgot", { method: "POST", json: { email: email.trim() } });
      setStep("code");
      toast.show("Code sent — check your inbox", "success");
    } catch (e: any) {
      setError(e?.message ?? "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    if (code.trim().length !== 6) return setError("Enter the 6-digit code from the email.");
    if (password.length < 6) return setError("New password needs 6+ characters.");
    setBusy(true);
    try {
      const r = await api<{ session_token: string; user: any }>("/auth/reset", { method: "POST", json: { email: email.trim(), code: code.trim(), new_password: password } });
      setToken(r.session_token);
      await storage.secureSet(TOKEN_KEY, r.session_token);
      toast.show("Password updated — you’re signed in", "success");
      setUser(r.user);
    } catch (e: any) {
      setError(e?.message ?? "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthBackdrop dim={0.3}>
      <View style={[styles.root, { paddingTop: insets.top }]} testID="forgot-screen">
        <AuthHeader testID="forgot-back-button" fallback="/(auth)/login" />
        <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(500)} style={styles.brand}>
            <View style={styles.badge}>
              <Icon name={step === "email" ? "mail-outline" : "key-outline"} size={30} color={colors.onWallpaper} />
            </View>
            <Text style={styles.title}>{step === "email" ? "Reset your password" : "Enter your code"}</Text>
            <Text style={styles.subtitle}>{step === "email" ? "We’ll email you a 6-digit code to reset your password." : `We sent a 6-digit code to ${email.trim()}. It expires in 15 minutes.`}</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.card}>
            {step === "email" ? (
              <>
                <Field label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="go" onSubmitEditing={sendCode} testID="forgot-email-input" />
                {error ? <Text style={styles.error} testID="forgot-error">{error}</Text> : null}
                <Button title="Send Reset Code" icon="paper-plane-outline" onPress={sendCode} loading={busy} testID="forgot-submit-button" style={{ height: 46 }} />
              </>
            ) : (
              <>
                <Field label="6-digit code" placeholder="123456" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} testID="forgot-code-input" />
                <Field label="New password" placeholder="6+ characters" value={password} onChangeText={setPassword} secureTextEntry testID="forgot-new-password-input" />
                {error ? <Text style={styles.error} testID="forgot-error">{error}</Text> : null}
                <Button title="Set New Password" icon="key-outline" onPress={reset} loading={busy} testID="forgot-reset-button" style={{ height: 46 }} />
                <Pressable testID="forgot-resend-link" onPress={sendCode} style={{ alignItems: "center", paddingVertical: 4 }}>
                  <Text style={styles.link}>Resend code</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
          <Pressable testID="forgot-back-link" onPress={() => router.replace("/(auth)/login")} style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={styles.footer}>
              Remembered it? <Text style={styles.footerStrong}>Back to sign in</Text>
            </Text>
          </Pressable>
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
  title: { fontSize: 26, fontWeight: "800", color: c.onWallpaper, textAlign: "center", letterSpacing: -0.4 },
  subtitle: { fontSize: 14.5, color: c.onWallpaperMuted, textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 14 },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: 13.5 },
  error: { color: c.error, fontSize: 13.5, textAlign: "center" },
  footer: { color: c.onWallpaperMuted, fontSize: 13.5 },
  footerStrong: { color: c.warning, fontWeight: "700" },
}));
