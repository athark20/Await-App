import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { makeStyles, spacing, useTheme } from "@/src/theme";
import { Chips, EmptyState, Icon, SectionTitle } from "@/src/components/ui";
import { AwaitCard } from "@/src/components/AwaitCard";
import { ErrorRetry, OfflineBanner } from "@/src/components/common";
import { useAwaits } from "@/src/hooks";
import { useAuth } from "@/src/auth";
import { greeting } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { scheduleReminder } from "@/src/notifications";
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
  const items = useMemo(() => q.data ?? [], [q.data]);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useEffect(() => {
    if (prefs.notifDue) items.forEach((it) => scheduleReminder(it, prefs.quietHours));
  }, [items, prefs.notifDue, prefs.quietHours]);

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
            <Text style={styles.sub}>Here’s what you’re waiting for.</Text>
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
                {groups.overdue.map((it) => <AwaitCard key={`o-${it.id}`} item={it} />)}
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

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, paddingBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, marginBottom: 4 },
  greeting: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 4 },
  none: { color: c.muted, fontSize: 13.5, paddingVertical: 8 },
  reviewBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.purpleTint, borderRadius: 14, padding: 12, marginTop: 12 },
  reviewText: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 13.5 },
}));
