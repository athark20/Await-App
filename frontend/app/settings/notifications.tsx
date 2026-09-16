import React, { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing } from "@/src/theme";
import { Group, ListRow, ScreenHeader, Banner, Button } from "@/src/components/ui";
import { usePrefs } from "@/src/prefs";
import { getPermissionStatus, requestPermission, fireTestNotification } from "@/src/notifications";
import { useAwaits } from "@/src/hooks";
import { useToast } from "@/src/components/Toast";

export default function NotificationSettings() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { prefs, update } = usePrefs();
  const toast = useToast();
  const [perm, setPerm] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const awaits = useAwaits({ include_done: "false" });

  useEffect(() => {
    getPermissionStatus().then(setPerm);
  }, []);

  const enable = async () => {
    if (perm && !perm.canAskAgain) return Linking.openSettings();
    const ok = await requestPermission();
    setPerm(await getPermissionStatus());
    toast.show(ok ? "Notifications enabled" : "Permission not granted", ok ? "success" : "error");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="notification-settings-screen">
      <ScreenHeader title="Notifications" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {perm && !perm.granted ? (
          <Pressable onPress={enable} testID="notif-enable-banner">
            <Banner icon="notifications-off-outline" tone="warning" text={perm.canAskAgain ? "Notifications are off. Tap to enable reminders." : "Notifications are blocked. Tap to open Settings."} />
          </Pressable>
        ) : null}
        <Group>
          <ListRow testID="notif-due-toggle" icon="calendar-outline" title="Due-date reminders" subtitle="When an Await reaches its expected date" toggle={prefs.notifDue} onToggle={(v) => update({ notifDue: v })} />
          <ListRow testID="notif-overdue-toggle" icon="alert-circle-outline" tone="error" title="Overdue reminders" subtitle="Follow-up nudges when someone is late" toggle={prefs.notifOverdue} onToggle={(v) => update({ notifOverdue: v })} />
          <ListRow testID="notif-digest-toggle" icon="eye-outline" tone="purple" title="Needs Review digest" subtitle="A summary instead of repeated pings" toggle={prefs.notifDigest} onToggle={(v) => update({ notifDigest: v })} />
          <ListRow testID="notif-daily-toggle" icon="sunny-outline" tone="warning" title="Daily summary" subtitle="What you’re waiting for today, at 9 AM" toggle={prefs.notifDaily} onToggle={(v) => update({ notifDaily: v })} />
          <ListRow testID="notif-weekly-toggle" icon="sparkles-outline" tone="success" title="Weekly recap" subtitle="Sunday 6 PM · resolved, slipped, who owes you most" toggle={prefs.notifWeekly} onToggle={(v) => update({ notifWeekly: v })} />
          <ListRow testID="notif-quiet-toggle" icon="moon-outline" tone="neutral" title="Quiet hours" subtitle="No reminders between 10 PM – 8 AM" toggle={prefs.quietHours} onToggle={(v) => update({ quietHours: v })} last />
        </Group>
        <Text style={styles.section}>Channels</Text>
        <Group>
          <ListRow icon="notifications-outline" title="Due reminders" subtitle="Default importance" />
          <ListRow icon="flame-outline" tone="error" title="Overdue / Follow-up reminders" subtitle="High importance" />
          <ListRow icon="list-outline" tone="purple" title="Needs Review summary" subtitle="Low importance" last />
        </Group>
        <Text style={styles.section}>Anti-spam</Text>
        <Banner icon="shield-checkmark-outline" text="Due → overdue → follow-up → repeated reminders → Needs Review. After 3 ignored reminders, Await stops repeating and moves the item to Needs Review." />
        {awaits.data?.length ? (
          <Button title="Send a test notification" variant="outline" icon="paper-plane-outline" onPress={() => { fireTestNotification(awaits.data![0]); toast.show("Test notification in 2s", "info"); }} testID="notif-test-button" />
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 12 },
  section: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
}));
