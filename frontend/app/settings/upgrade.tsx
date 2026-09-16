import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PurchasesPackage } from "react-native-purchases";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Banner, Button, Icon, ScreenHeader } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { useToast } from "@/src/components/Toast";
import { rcSimulated, useSubscription } from "@/src/revenuecat";

const PRO = ["Unlimited active Awaits", "Higher fair-use AI extraction", "Voice capture", "Higher fair-use AI follow-up drafting", "Smart reminder schedules", "Unlimited history", "Advanced search & filtering", "Enhanced AI update matching", "Multiple evidence items", "No ads"];
const FREE = ["10 active Awaits", "Manual creation", "Basic reminders", "5 AI extractions / month", "3 AI follow-up drafts / month", "30-day completed history", "Light / dark themes", "Native Share-to-Await", "Screenshot sharing", "Basic search", "No ads"];

export default function Upgrade() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const sub = useSubscription();
  const packages = sub.offerings?.current?.availablePackages ?? [];
  const monthly = packages.find((p) => p.identifier === "$rc_monthly") ?? packages[0];
  const annual = packages.find((p) => p.identifier === "$rc_annual") ?? packages[1];
  const [selected, setSelected] = useState<string>("$rc_annual");
  const [confirm, setConfirm] = useState(false);
  const pkg: PurchasesPackage | undefined = packages.find((p) => p.identifier === selected) ?? annual ?? monthly;

  const savings = (() => {
    if (!monthly || !annual) return null;
    const m = monthly.product.price * 12;
    if (!m) return null;
    return Math.max(0, Math.round((1 - annual.product.price / m) * 100));
  })();

  const buy = async () => {
    if (!pkg) return;
    setConfirm(false);
    try {
      await sub.purchase(pkg);
      toast.show("Welcome to Await Pro", "success");
      router.back();
    } catch (e: any) {
      if (e?.userCancelled) return;
      if (String(e?.message).includes("identity_not_ready")) return toast.show("Sign-in identity not ready — try again in a moment", "error");
      toast.show(e?.message ?? "Purchase failed", "error");
    }
  };

  const restore = async () => {
    try {
      const info = await sub.restore();
      const active = info.entitlements.active?.["pro"] !== undefined;
      toast.show(active ? "Pro restored" : "No purchases found", active ? "success" : "info");
    } catch (e: any) {
      toast.show(e?.message ?? "Restore failed", "error");
    }
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
        {sub.isSubscribed ? <Banner icon="checkmark-circle" tone="success" text="You’re on Await Pro. Thank you!" testID="pro-active-banner" /> : null}
        {sub.identityError ? <Banner icon="alert-circle-outline" tone="error" text={`Purchases unavailable: ${sub.identityError}`} testID="identity-error-banner" /> : null}
        {rcSimulated && !sub.isSubscribed ? <Banner icon="flask-outline" tone="warning" text="Simulated purchases (RevenueCat Test Store). Real billing works in the store build." testID="simulated-banner" /> : null}

        <View style={styles.card}>
          {PRO.map((f) => (
            <View key={f} style={styles.feat}>
              <Icon name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.featText}>{f}</Text>
            </View>
          ))}
        </View>

        {sub.isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 16 }} />
        ) : packages.length === 0 ? (
          <View style={styles.card} testID="offerings-unavailable">
            <Text style={{ color: colors.muted, textAlign: "center" }}>Subscription options are unavailable right now. Please try again later.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 10 }}>
            {monthly ? <PlanCard testID="plan-monthly" selected={selected === monthly.identifier} onPress={() => setSelected(monthly.identifier)} title={monthly.product.title || "Monthly"} price={monthly.product.priceString} period="/ month" /> : null}
            {annual ? <PlanCard testID="plan-yearly" selected={selected === annual.identifier} onPress={() => setSelected(annual.identifier)} title={annual.product.title || "Yearly"} price={annual.product.priceString} period="/ year" badge={savings ? `Save ${savings}%` : undefined} /> : null}
          </View>
        )}

        <Button
          title={sub.isSubscribed ? "You’re on Pro" : "Upgrade to Pro"}
          onPress={() => setConfirm(true)}
          loading={sub.isPurchasing}
          disabled={sub.isSubscribed || !pkg || !sub.identityReady}
          testID="upgrade-button"
        />
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
          <Pressable onPress={restore} disabled={sub.isRestoring} testID="restore-purchase-link"><Text style={styles.link}>{sub.isRestoring ? "Restoring…" : "Restore Purchase"}</Text></Pressable>
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

      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        icon="star"
        tone="warning"
        title="Confirm subscription"
        subtitle={pkg ? `${pkg.product.title || pkg.identifier} · ${pkg.product.priceString}${rcSimulated ? "\n(Simulated — Test Store)" : ""}` : ""}
        primary={{ title: "Subscribe", onPress: buy }}
        secondary={{ title: "Cancel", onPress: () => setConfirm(false) }}
        testID="purchase-confirm-sheet"
      />
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
        <Text style={styles.planTitle} numberOfLines={1}>{title}</Text>
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
  planTitle: { fontSize: 14, fontWeight: "700", color: c.onSurface, flexShrink: 1 },
  price: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  period: { fontSize: 12.5, color: c.muted, fontWeight: "500" },
  badge: { fontSize: 12, color: c.success, fontWeight: "700" },
  link: { color: c.muted, fontSize: 13, fontWeight: "600" },
  section: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
}));
