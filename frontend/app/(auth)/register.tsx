import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, spacing, useTheme } from "@/src/theme";
import { Button, Field, Icon, ScreenHeader } from "@/src/components/ui";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";

export default function Register() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 6) return setError("Fill all fields. Password needs 6+ characters.");
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? "Could not create account");
      toast.show(e?.message ?? "Could not create account", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="register-screen">
      <ScreenHeader />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Get started with Await</Text>
        <Field label="Full name" placeholder="Alex" value={name} onChangeText={setName} testID="register-name-input" />
        <Field label="Email" placeholder="alex@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="register-email-input" />
        <View>
          <Field label="Password" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry={!show} testID="register-password-input" />
          <Pressable testID="register-toggle-password" onPress={() => setShow((s) => !s)} style={styles.eye} hitSlop={8}>
            <Icon name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
          </Pressable>
        </View>
        {error ? (
          <Text style={styles.error} testID="register-error">
            {error}
          </Text>
        ) : null}
        <Button title="Create Account" onPress={submit} loading={busy} testID="register-submit-button" />
        <Pressable testID="register-signin-link" onPress={() => router.replace("/(auth)/login")} style={{ alignItems: "center", paddingVertical: 8 }}>
          <Text style={styles.footer}>
            Already have an account? <Text style={styles.link}>Sign in</Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xxl, gap: 16, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: "800", color: c.onSurface },
  subtitle: { fontSize: 15, color: c.muted, marginTop: -8, marginBottom: 8 },
  eye: { position: "absolute", right: 14, top: 36, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: 13.5 },
  footer: { color: c.muted, fontSize: 13.5 },
  error: { color: c.error, fontSize: 13.5 },
}));
