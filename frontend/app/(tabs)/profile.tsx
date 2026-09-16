import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Group, ListRow, Icon, Pill } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { useStats } from "@/src/hooks";

export default function Profile() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const stats = useStats();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <View style={styles.root} testID="profile-screen">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: bottomChrome + 24 }]}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.userCard} testID="profile-user-card">
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name ?? "A").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} testID="profile-name">
              {user?.name}
            </Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
          <Pill text={user?.plan === "PRO" ? "Pro" : "Free"} tone={user?.plan === "PRO" ? "warning" : "neutral"} testID="profile-plan-pill" />
        </View>

        <Group>
          <ListRow testID="profile-notifications-row" icon="notifications-outline" title="Notifications" subtitle="Reminders, digests, quiet hours" onPress={() => router.push("/settings/notifications")} />
          <ListRow testID="profile-preferences-row" icon="options-outline" title="Preferences" subtitle="Appearance, snooze, date format" onPress={() => router.push("/settings/preferences")} />
          <ListRow testID="profile-privacy-row" icon="shield-checkmark-outline" title="Privacy & Security" subtitle="App lock, your data" onPress={() => router.push("/settings/privacy")} />
          <ListRow testID="profile-progress-row" icon="stats-chart-outline" tone="success" title="My Progress" subtitle={stats.data ? `${stats.data.total} total · ${stats.data.done} done` : "Stats and category breakdown"} onPress={() => router.push("/stats")} />
          <ListRow testID="profile-history-row" icon="time-outline" tone="purple" title="History" subtitle="Completed Awaits" onPress={() => router.push("/history")} />
          <ListRow testID="profile-help-row" icon="help-circle-outline" title="Help & Support" onPress={() => router.push("/settings/help")} last />
        </Group>

        <Pressable testID="profile-upgrade-row" onPress={() => router.push("/settings/upgrade")} style={({ pressed }) => [styles.upgrade, pressed && { opacity: 0.85 }]}>
          <View style={styles.crown}>
            <Icon name="star" size={20} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.upTitle}>{user?.plan === "PRO" ? "You’re on Pro" : "Upgrade to Pro"}</Text>
            <Text style={styles.upSub}>{user?.plan === "PRO" ? "Unlimited Awaits, voice capture, smart reminders" : "Unlimited Awaits · voice capture · smart reminders"}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Pressable testID="profile-logout-button" onPress={() => setConfirmLogout(true)} style={styles.logout}>
          <Icon name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
        <Text style={styles.version}>Await · Version 1.0.0</Text>
      </ScrollView>

      <Sheet
        visible={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        icon="log-out-outline"
        tone="error"
        title="Log out?"
        subtitle="Your Awaits stay safely saved to your account."
        primary={{ title: "Log Out", variant: "danger", onPress: () => { setConfirmLogout(false); logout(); } }}
        secondary={{ title: "Cancel", onPress: () => setConfirmLogout(false) }}
        testID="logout-sheet"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 14 },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  userCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 20 },
  name: { fontSize: 17, fontWeight: "800", color: c.onSurface },
  email: { fontSize: 13, color: c.muted, marginTop: 2 },
  upgrade: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 14 },
  crown: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.warningTint, alignItems: "center", justifyContent: "center" },
  upTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  upSub: { fontSize: 12.5, color: c.muted, marginTop: 2 },
  logout: { height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.error, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.errorTint },
  logoutText: { color: c.error, fontWeight: "700", fontSize: 15 },
  version: { textAlign: "center", color: c.muted, fontSize: 12 },
}));
