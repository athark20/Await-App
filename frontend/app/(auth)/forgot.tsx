import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, spacing } from "@/src/theme";
import { Button, Field, IconBox, ScreenHeader } from "@/src/components/ui";
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
    <View style={[styles.root, { paddingTop: insets.top }]} testID="forgot-screen">
      <ScreenHeader />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <IconBox name={step === "email" ? "mail-outline" : "key-outline"} size={80} />
        </View>
        <Text style={styles.title}>{step === "email" ? "Reset your password" : "Enter your code"}</Text>
        <Text style={styles.subtitle}>{step === "email" ? "We’ll email you a 6-digit code to reset your password." : `We sent a 6-digit code to ${email.trim()}. It expires in 15 minutes.`}</Text>
        {step === "email" ? (
          <>
            <Field label="Email" placeholder="alex@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="forgot-email-input" />
            {error ? <Text style={styles.error} testID="forgot-error">{error}</Text> : null}
            <Button title="Send Reset Code" onPress={sendCode} loading={busy} testID="forgot-submit-button" />
          </>
        ) : (
          <>
            <Field label="6-digit code" placeholder="123456" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} testID="forgot-code-input" />
            <Field label="New password" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry testID="forgot-new-password-input" />
            {error ? <Text style={styles.error} testID="forgot-error">{error}</Text> : null}
            <Button title="Set New Password" onPress={reset} loading={busy} testID="forgot-reset-button" />
            <Pressable testID="forgot-resend-link" onPress={sendCode} style={{ alignItems: "center", paddingVertical: 8 }}>
              <Text style={styles.link}>Resend code</Text>
            </Pressable>
          </>
        )}
        <Pressable testID="forgot-back-link" onPress={() => router.replace("/(auth)/login")} style={{ alignItems: "center", paddingVertical: 8 }}>
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xxl, gap: 16, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  subtitle: { fontSize: 14.5, color: c.muted, textAlign: "center", marginTop: -8, marginBottom: 8, lineHeight: 20 },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: 13.5 },
  error: { color: c.error, fontSize: 13.5, textAlign: "center" },
}));
