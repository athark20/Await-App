import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Icon, ScreenHeader } from "@/src/components/ui";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { useInvalidateAwaits } from "@/src/hooks";

const PRO = ["Unlimited active Awaits", "Higher fair-use AI extraction", "Voice capture", "Higher fair-use AI follow-up drafting", "Smart reminder schedules", "Unlimited history", "Advanced search & filtering", "Enhanced AI update matching", "Multiple evidence items", "No ads"];
const FREE = ["10 active Awaits", "Manual creation", "Basic reminders", "5 AI extractions / month", "3 AI follow-up drafts / month", "30-day completed history", "Light / dark themes", "Native Share-to-Await", "Screenshot sharing", "Basic search", "No ads"];

export default function Upgrade() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateAwaits();
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const isPro = user?.plan === "PRO";

  const upgrade = async () => {
    setBusy(true);
    try {
      await api("/plan/upgrade", { method: "POST" });
      await refresh();
      invalidate();
      toast.show("Welcome to Await Pro", "success");
      router.back();
    } catch (e: any) {
      toast.show(e?.message ?? "Purchase failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    await api("/plan/restore", { method: "POST" });
    await refresh();
    toast.show(isPro ? "Pro restored" : "No purchases found", "info");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="upgrade-screen">
      <ScreenHeader title="Upgrade to Pro" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <View style={styles.crown}>
            <Icon name="star" size={30} color={colors.warning} />
          </View>
          <Text style={styles.title}>Go Pro</Text>
          <Text style={styles.sub}>Get the most out of Await</Text>
        </View>
        <View style={styles.card}>
          {PRO.map((f) => (
            <View key={f} style={styles.feat}>
              <Icon name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.featText}>{f}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <PlanCard testID="plan-monthly" selected={plan === "monthly"} onPress={() => setPlan("monthly")} title="Monthly" price="₹99" period="/ month" />
          <PlanCard testID="plan-yearly" selected={plan === "yearly"} onPress={() => setPlan("yearly")} title="Yearly" price="₹799" period="/ year" badge="Save 33%" />
        </View>
        <Button title={isPro ? "You’re on Pro" : "Upgrade to Pro"} onPress={upgrade} loading={busy} disabled={isPro} testID="upgrade-button" />
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
          <Pressable onPress={restore} testID="restore-purchase-link"><Text style={styles.link}>Restore Purchase</Text></Pressable>
          <Text style={styles.link}>|</Text>
          <Pressable onPress={() => router.back()} testID="maybe-later-link"><Text style={styles.link}>Maybe Later</Text></Pressable>
        </View>
        <Text style={styles.section}>Free plan includes</Text>
        <View style={styles.card}>
          {FREE.map((f) => (
            <View key={f} style={styles.feat}>
              <Icon name="checkmark" size={16} color={colors.muted} />
              <Text style={[styles.featText, { color: colors.muted }]}>{f}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function PlanCard({ selected, onPress, title, price, period, badge, testID }: { selected: boolean; onPress: () => void; title: string; price: string; period: string; badge?: string; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.plan, selected && styles.planSel]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={selected ? "radio-button-on" : "radio-button-off"} size={18} color={selected ? colors.brandPrimary : colors.muted} />
        <Text style={styles.planTitle}>{title}</Text>
      </View>
      <Text style={styles.price}>{price} <Text style={styles.period}>{period}</Text></Text>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 14 },
  crown: { width: 64, height: 64, borderRadius: 20, backgroundColor: c.warningTint, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14.5, color: c.muted },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 10 },
  feat: { flexDirection: "row", alignItems: "center", gap: 10 },
  featText: { fontSize: 14.5, color: c.onSurface },
  plan: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, padding: 14, gap: 4 },
  planSel: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  planTitle: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  price: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  period: { fontSize: 12.5, color: c.muted, fontWeight: "500" },
  badge: { fontSize: 12, color: c.success, fontWeight: "700" },
  link: { color: c.muted, fontSize: 13, fontWeight: "600" },
  section: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
}));
