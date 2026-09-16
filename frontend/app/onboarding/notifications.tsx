import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing } from "@/src/theme";
import { Button, IconBox, ScreenHeader, Group, ListRow } from "@/src/components/ui";
import { getPermissionStatus, requestPermission } from "@/src/notifications";
import { usePrefs } from "@/src/prefs";
import { useToast } from "@/src/components/Toast";

export default function NotificationEducation() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { update } = usePrefs();
  const toast = useToast();
  const [blocked, setBlocked] = useState(false);

  const finish = () => {
    update({ notifAsked: true });
    router.replace("/(tabs)");
  };

  const enable = async () => {
    const status = await getPermissionStatus();
    if (status.granted) return finish();
    if (!status.canAskAgain) {
      setBlocked(true);
      return;
    }
    const granted = await requestPermission();
    if (!granted) toast.show("You can enable reminders later in Settings", "info");
    finish();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="notification-education-screen">
      <ScreenHeader onBack={finish} />
      <View style={styles.content}>
        <View style={{ alignItems: "center" }}>
          <IconBox name="notifications-outline" size={88} />
        </View>
        <Text style={styles.title}>Stay on top of things</Text>
        <Text style={styles.subtitle}>Get notified about updates, due dates and reminders.</Text>
        <Group>
          <ListRow icon="calendar-outline" title="Due-date reminders" subtitle="When an Await reaches its expected date" />
          <ListRow icon="alert-circle-outline" tone="error" title="Overdue reminders" subtitle="When someone is late on a commitment" />
          <ListRow icon="chatbubble-ellipses-outline" tone="warning" title="Follow-up reminders" subtitle="Nudges to check in after you follow up" />
          <ListRow icon="eye-outline" tone="purple" title="Needs Review summaries" subtitle="A calm digest instead of repeated pings" />
          <ListRow icon="flash-outline" tone="success" title="Act from the notification" subtitle="Follow Up · Mark Done · Later" last />
        </Group>
        {blocked ? (
          <Pressable testID="open-settings-button" onPress={() => Linking.openSettings()} style={styles.settings}>
            <Text style={styles.settingsText}>Notifications are blocked. Open Settings to enable them.</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button title="Enable notifications" onPress={enable} testID="enable-notifications-button" />
        <Pressable testID="not-now-button" onPress={finish} style={styles.notNow}>
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: 12, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface, textAlign: "center", marginTop: 8 },
  subtitle: { fontSize: 14.5, color: c.muted, textAlign: "center", marginBottom: 12, lineHeight: 20 },
  footer: { paddingHorizontal: spacing.xl, gap: 4 },
  notNow: { height: 44, alignItems: "center", justifyContent: "center" },
  notNowText: { color: c.brandPrimary, fontWeight: "600", fontSize: 15 },
  settings: { backgroundColor: c.warningTint, borderRadius: 14, padding: 12 },
  settingsText: { color: c.onSurface, fontSize: 13.5, textAlign: "center" },
}));
