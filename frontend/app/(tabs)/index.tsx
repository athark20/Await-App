import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Chips, EmptyState, Icon, SectionTitle } from "@/src/components/ui";
import { AwaitCard } from "@/src/components/AwaitCard";
import { SnoozeSheet, type SnoozePick } from "@/src/components/SnoozeSheet";
import { useToast } from "@/src/components/Toast";
import { ErrorRetry, OfflineBanner } from "@/src/components/common";
import { useAwaits, useAwaitAction, useStats } from "@/src/hooks";
import { useAuth } from "@/src/auth";
import { greeting, money } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { scheduleDailySummary, scheduleReminder, scheduleWeeklyRecap } from "@/src/notifications";
import { api } from "@/src/api";
import { usePrefs } from "@/src/prefs";
import type { AwaitItem } from "@/src/types";

type Filter = "ALL" | "TODAY" | "UPCOMING";

export default function Home() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const [filter, setFilter] = useState<Filter>("ALL");
  const q = useAwaits({ include_done: "false" });
  const stats = useStats();
  const owed = (stats.data as any)?.owed as number | undefined;
  const currency = (stats.data as any)?.currency as string | undefined;
  const items = useMemo(() => q.data ?? [], [q.data]);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useEffect(() => {
    if (prefs.notifDue) items.forEach((it) => scheduleReminder(it, prefs.quietHours));
    api<{ body: string }>("/summary/today").then((s) => scheduleDailySummary(s.body, prefs.notifDaily, prefs.digestHour, prefs.digestMinute)).catch(() => {});
    api<{ headline: string }>("/recap/weekly").then((r) => scheduleWeeklyRecap(r.headline, prefs.notifWeekly)).catch(() => {});
  }, [items, prefs.notifDue, prefs.quietHours, prefs.notifDaily, prefs.digestHour, prefs.digestMinute, prefs.notifWeekly]);

  // Recurring templates: create anything that's due, then refresh the list.
  useEffect(() => {
    api<{ created: unknown[] }>("/templates/tick", { method: "POST" })
      .then((r) => {
        if (r.created.length) q.refetch();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSunday = dayjs().day() === 0;

  const groups = useMemo(() => {
    const today = dayjs().startOf("day");
    const overdue: AwaitItem[] = [];
    const due: AwaitItem[] = [];
    const upcoming: AwaitItem[] = [];
    const review: AwaitItem[] = [];
    for (const it of items) {
      if (it.attentionState === "NEEDS_REVIEW" || it.attentionState === "POSSIBLE_RESOLUTION") review.push(it);
      else if (!it.expectedAt) upcoming.push(it);
      else {
        const d = dayjs(it.expectedAt).startOf("day");
        if (d.isBefore(today)) overdue.push(it);
        else if (d.isSame(today)) due.push(it);
        else upcoming.push(it);
      }
    }
    return { overdue, due, upcoming, review };
  }, [items]);

  const todayList = groups.due;
  const showToday = filter !== "UPCOMING";
  const showUpcoming = filter !== "TODAY";
  const showOverdueSection = filter !== "UPCOMING" && groups.overdue.length > 0;
  const firstName = (user?.name ?? "there").split(" ")[0];

  return (
    <View style={styles.root} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting} testID="home-greeting">
              {greeting()}, {firstName} 👋
            </Text>
            <Text style={styles.sub} testID="home-owed-line">{owed ? `${money(owed, currency)} still owed to you.` : "Here’s what you’re waiting for."}</Text>
          </View>
          <Pressable testID="home-profile-avatar" onPress={() => router.push("/(tabs)/profile")} style={styles.avatar}>
            <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
          </Pressable>
        </View>
        <Chips<Filter>
          testID="home-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { key: "ALL", label: "All", count: items.length },
            { key: "TODAY", label: "Today", count: todayList.length + groups.overdue.length },
            { key: "UPCOMING", label: "Upcoming", count: groups.upcoming.length },
          ]}
        />
      </View>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {q.isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 48 }} />
        ) : q.isError ? (
          <ErrorRetry onRetry={q.refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            testID="home-empty"
            icon="checkmark-done-outline"
            title="Nothing open yet."
            subtitle="Add something you’re waiting on and Await will remember when it matters."
            cta="Add your first Await"
            onCta={() => router.push("/(tabs)/add")}
          />
        ) : (
          <>
            <View style={styles.strip} testID="home-summary-strip">
              <Stat icon="alert-circle-outline" label="Overdue" value={groups.overdue.length} color={colors.error} />
              <Stat icon="today-outline" label="Due today" value={groups.due.length} color={colors.warning} />
              <Stat icon="hourglass-outline" label="Waiting" value={groups.upcoming.length} color={colors.brandPrimary} />
              <Stat icon="eye-outline" label="Review" value={groups.review.length} color={colors.purple} />
            </View>
            {isSunday && filter === "ALL" ? (
              <Pressable testID="home-recap-card" onPress={() => router.push("/recap")} style={({ pressed }) => [styles.recap, pressed && { opacity: 0.9 }]}>
                <View style={styles.recapIcon}>
                  <Icon name="sparkles" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recapTitle}>Your week in Await</Text>
                  <Text style={styles.recapSub}>What got resolved, what slipped, who owes you the most.</Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
            {groups.review.length > 0 && filter === "ALL" ? (
              <Pressable testID="home-needs-review-banner" onPress={() => router.push("/needs-review")} style={styles.reviewBanner}>
                <Icon name="eye-outline" size={18} color={colors.purple} />
                <Text style={styles.reviewText}>
                  {groups.review.length} {groups.review.length === 1 ? "Await needs" : "Awaits need"} your review
                </Text>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
            {showToday ? (
              <>
                <SectionTitle title="Today" count={todayList.length} />
                {todayList.length === 0 ? <Text style={styles.none}>Nothing due today.</Text> : todayList.map((it) => <AwaitCard key={it.id} item={it} />)}
              </>
            ) : null}
            {showUpcoming ? (
              <>
                <SectionTitle title="Upcoming" count={groups.upcoming.length} />
                {groups.upcoming.length === 0 ? <Text style={styles.none}>Nothing upcoming.</Text> : groups.upcoming.map((it) => <AwaitCard key={it.id} item={it} />)}
              </>
            ) : null}
            {showOverdueSection ? (
              <>
                <SectionTitle title="Overdue" count={groups.overdue.length} />
                {groups.overdue.map((it) => <OverdueItem key={`o-${it.id}`} item={it} />)}
              </>
            ) : null}
            {groups.review.length > 0 && filter === "ALL" ? (
              <>
                <SectionTitle title="Needs Review" count={groups.review.length} action="View" onAction={() => router.push("/needs-review")} />
                {groups.review.map((it) => <AwaitCard key={`r-${it.id}`} item={it} />)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={16} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OverdueItem({ item }: { item: AwaitItem }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const action = useAwaitAction(item.id);
  const [sheet, setSheet] = useState(false);

  const snooze = (until: string, days: number, label: string) => {
    const prev = { nextReminderAt: item.nextReminderAt, ignoredReminderCount: item.ignoredReminderCount };
    action.mutate(
      { path: "/snooze", json: { until, days } },
      {
        onSuccess: () => {
          setSheet(false);
          toast.show(`Reminder set · ${label}`, "success", {
            action: {
              label: "Undo",
              onPress: () =>
                action.mutate(
                  { path: "/reminder-restore", json: { nextReminderAt: prev.nextReminderAt, ignoredReminderCount: prev.ignoredReminderCount } },
                  { onSuccess: () => toast.show("Snooze undone", "info") },
                ),
            },
          });
        },
      },
    );
  };
  const quick = (days: number) => {
    const at = dayjs().add(days, "day").hour(9).minute(0).second(0);
    snooze(at.toISOString(), days, at.format("ddd, D MMM"));
  };
  const onPick = (p: SnoozePick) => snooze(p.until, p.days, dayjs(p.until).format("ddd, D MMM"));

  return (
    <>
      <AwaitCard
        item={item}
        footer={
          <View style={styles.qsRow} testID={`overdue-snooze-${item.id}`}>
            <Icon name="alarm-outline" size={14} color={colors.muted} />
            <QuickChip label="Tomorrow" onPress={() => quick(1)} />
            <QuickChip label="+3 days" onPress={() => quick(3)} />
            <QuickChip label="Next week" onPress={() => quick(7)} />
            <Pressable style={styles.qsMore} onPress={() => setSheet(true)} hitSlop={8} testID={`overdue-snooze-more-${item.id}`}>
              <Text style={styles.qsMoreText}>More</Text>
              <Icon name="chevron-forward" size={12} color={colors.brandPrimary} />
            </Pressable>
          </View>
        }
      />
      <SnoozeSheet visible={sheet} onClose={() => setSheet(false)} item={item} onPick={onPick} testID={`overdue-remind-${item.id}`} />
    </>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.qsChip, pressed && { opacity: 0.6 }]} onPress={onPress} hitSlop={6}>
      <Text style={styles.qsChipText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  strip: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 4 },
  stat: { flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 10, alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  statLabel: { fontSize: 11, color: c.muted },
  recap: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, marginTop: 8 },
  recapIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.warningTint, alignItems: "center", justifyContent: "center" },
  recapTitle: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  recapSub: { fontSize: 12.5, color: c.muted, marginTop: 2 },
  header: { backgroundColor: "transparent", paddingBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, marginBottom: 4 },
  greeting: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 4 },
  none: { color: c.muted, fontSize: 13.5, paddingVertical: 8 },
  reviewBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.purpleTint, borderRadius: 14, padding: 12, marginTop: 12 },
  reviewText: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 13.5 },
  qsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: c.border,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    paddingTop: 8,
    marginBottom: spacing.sm + 2,
  },
  qsChip: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  qsChipText: { fontSize: 12.5, fontWeight: "600", color: c.onSurface },
  qsMore: { flexDirection: "row", alignItems: "center", gap: 1, marginLeft: "auto", paddingVertical: 6, paddingHorizontal: 4 },
  qsMoreText: { fontSize: 12.5, fontWeight: "700", color: c.brandPrimary },
}));
