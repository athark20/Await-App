import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, spacing } from "@/src/theme";
import { Button, Field, IconBox, ScreenHeader } from "@/src/components/ui";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";

export default function Forgot() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api("/auth/forgot", { method: "POST", json: { email: email.trim() } });
      setSent(true);
      toast.show("Reset link sent", "success");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="forgot-screen">
      <ScreenHeader />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <IconBox name="mail-outline" size={80} />
        </View>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>{sent ? `We’ve sent a reset link to ${email}` : "We’ll send you a link to reset your password."}</Text>
        {!sent ? <Field label="Email" placeholder="alex@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="forgot-email-input" /> : null}
        <Button title={sent ? "Back to sign in" : "Send Reset Link"} onPress={sent ? () => router.replace("/(auth)/login") : submit} loading={busy} testID="forgot-submit-button" />
        {!sent ? (
          <Pressable testID="forgot-back-link" onPress={() => router.back()} style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={styles.link}>Back to sign in</Text>
          </Pressable>
        ) : null}
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
}));
