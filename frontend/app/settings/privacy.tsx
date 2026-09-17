import React, { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing } from "@/src/theme";
import { Group, ListRow, ScreenHeader, Banner, Field } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { usePrefs } from "@/src/prefs";
import { biometricAvailable, clearPin, savePin } from "@/src/app-lock";
import { api } from "@/src/api";
import { useInvalidateAwaits } from "@/src/hooks";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";

export default function Privacy() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const { logout } = useAuth();
  const invalidate = useInvalidateAwaits();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "clear" | "delete" | "pin">(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const toggleLock = async (v: boolean) => {
    if (v) {
      setPin(""); setPin2(""); setPinError(null);
      setSheet("pin");
    } else {
      await clearPin();
      update({ appLock: false });
      toast.show("App Lock disabled", "info");
    }
  };

  const savePinAndEnable = async () => {
    if (!/^\d{4}$/.test(pin)) return setPinError("PIN must be 4 digits.");
    if (pin !== pin2) return setPinError("PINs don’t match.");
    await savePin(pin);
    update({ appLock: true });
    setSheet(null);
    toast.show((await biometricAvailable()) ? "App Lock on — biometrics + PIN" : "App Lock on — PIN", "success");
  };

  const clear = async () => {
    await api("/data/clear", { method: "POST" });
    invalidate();
    setSheet(null);
    toast.show("App data cleared", "success");
    router.replace("/(tabs)");
  };
  const del = async () => {
    await api("/auth/account", { method: "DELETE" });
    setSheet(null);
    await logout();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="privacy-screen">
      <ScreenHeader title="Privacy & Security" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Banner icon="shield-checkmark-outline" tone="brand" text="Your data stays private and under your control. Await only processes content you choose to share — it never reads your inbox, messages, notifications or clipboard." testID="privacy-banner" />
        <Text style={styles.section}>App Lock</Text>
        <Group>
          <ListRow testID="privacy-applock-toggle" icon="lock-closed-outline" title="Biometric / passcode lock" subtitle="Fingerprint or face, with your 4-digit Await PIN" toggle={prefs.appLock} onToggle={toggleLock} />
          {prefs.appLock ? <ListRow testID="privacy-change-pin-row" icon="keypad-outline" title="Change Await PIN" onPress={() => { setPin(""); setPin2(""); setPinError(null); setSheet("pin"); }} /> : null}
          <ListRow icon="timer-outline" title="Auto-lock" value={prefs.appLock ? "After 1 minute in background" : "Off"} last />
        </Group>
        <Text style={styles.section}>Data & Privacy</Text>
        <Group>
          <ListRow testID="privacy-clear-row" icon="trash-bin-outline" tone="warning" title="Clear App Data" subtitle="Removes all your Awaits and evidence" onPress={() => setSheet("clear")} />
          <ListRow testID="privacy-policy-row" icon="document-text-outline" title="Privacy Policy" onPress={() => Linking.openURL("https://await.app/privacy")} />
          <ListRow testID="privacy-terms-row" icon="reader-outline" title="Terms of Service" onPress={() => Linking.openURL("https://await.app/terms")} />
          <ListRow testID="privacy-delete-row" icon="person-remove-outline" danger title="Delete account" subtitle="Permanently remove your account" onPress={() => setSheet("delete")} last />
        </Group>
        <Text style={styles.note}>No connected apps. No inbox access. No automatic sending. Ever.</Text>
      </ScrollView>
      <Sheet visible={sheet === "pin"} onClose={() => setSheet(null)} icon="keypad-outline" title="Set your Await PIN" subtitle="4 digits. Used when biometrics aren’t available." primary={{ title: "Save PIN & enable", onPress: savePinAndEnable }} secondary={{ title: "Cancel", onPress: () => setSheet(null) }} testID="pin-sheet">
        <View style={{ gap: 12, marginTop: 12 }}>
          <Field placeholder="Enter 4-digit PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} testID="pin-input" />
          <Field placeholder="Confirm PIN" value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} testID="pin-confirm-input" hint={pinError ?? undefined} />
        </View>
      </Sheet>
      <Sheet visible={sheet === "clear"} onClose={() => setSheet(null)} icon="trash-bin-outline" tone="warning" title="Clear app data?" subtitle="All your Awaits, notes and evidence will be removed." primary={{ title: "Clear App Data", variant: "danger", onPress: clear }} secondary={{ title: "Cancel", onPress: () => setSheet(null) }} testID="clear-data-sheet" />
      <Sheet visible={sheet === "delete"} onClose={() => setSheet(null)} icon="person-remove-outline" tone="error" title="Delete account?" subtitle="This removes your account and all data. This cannot be undone." primary={{ title: "Delete account", variant: "danger", onPress: del }} secondary={{ title: "Cancel", onPress: () => setSheet(null) }} testID="delete-account-sheet" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.xl, gap: 12 },
  section: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
  note: { fontSize: 12.5, color: c.muted, textAlign: "center", marginTop: 8 },
}));
