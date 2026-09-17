import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Icon, IconBox, Pill, ScreenHeader, SectionTitle } from "@/src/components/ui";
import { OWNER_PREFIX } from "@/app/followup/[id]";
import { AwaitCard } from "@/src/components/AwaitCard";
import { Ring } from "@/src/components/Ring";
import { ErrorRetry } from "@/src/components/common";
import { api } from "@/src/api";
import { fromNow, money } from "@/src/format";
import type { AwaitItem, TimelineEvent } from "@/src/types";

export interface OwnerStats {
  open: number;
  done: number;
  overdue: number;
  myTurn: number;
  owed: number;
  recovered: number;
  currency: string;
  onTimeRate: number | null;
  avgDaysLate: number;
  remindersSent: number;
  followups: number;
  lastActivityAt: string | null;
  total: number;
}
interface OwnerProfile {
  ownerName: string;
  stats: OwnerStats;
  open: AwaitItem[];
  done: AwaitItem[];
  recent: (TimelineEvent & { awaitItemId: string })[];
}

export function trackRecord(s: OwnerStats): { label: string; tone: "success" | "warning" | "error" | "neutral" } {
  if (s.onTimeRate === null) return { label: s.overdue ? "Running late" : "No history yet", tone: s.overdue ? "error" : "neutral" };
  if (s.onTimeRate >= 0.8 && !s.overdue) return { label: "Reliable", tone: "success" };
  if (s.onTimeRate >= 0.5) return { label: "Mixed record", tone: "warning" };
  return { label: "Often late", tone: "error" };
}

export default function OwnerProfileScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const q = useQuery({ queryKey: ["owners", name], queryFn: () => api<OwnerProfile>(`/owners/${encodeURIComponent(name)}`), enabled: !!name });
  const p = q.data;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="owner-screen">
      <ScreenHeader title={p?.ownerName ?? "Profile"} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
        {q.isError ? <ErrorRetry onRetry={q.refetch} message="Couldn’t load this profile." /> : null}
        {p ? (
          <>
            <View style={styles.card} testID="owner-hero">
              <View style={styles.heroRow}>
                <IconBox letter={p.ownerName.charAt(0).toUpperCase()} tone={p.stats.overdue ? "error" : "brand"} size={64} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name} testID="owner-name">{p.ownerName}</Text>
                  <Text style={styles.sub}>
                    {p.stats.open} open · {p.stats.done} done{p.stats.lastActivityAt ? ` · active ${fromNow(p.stats.lastActivityAt)}` : ""}
                  </Text>
                  <View style={{ flexDirection: "row" }}>
                    <Pill text={trackRecord(p.stats).label} tone={trackRecord(p.stats).tone} testID="owner-record-pill" />
                  </View>
                </View>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Ring value={p.stats.onTimeRate ?? 0} size={62} color={p.stats.onTimeRate === null ? colors.muted : p.stats.onTimeRate >= 0.8 ? colors.success : p.stats.onTimeRate >= 0.5 ? colors.warning : colors.error} label={p.stats.onTimeRate === null ? "—" : `${Math.round(p.stats.onTimeRate * 100)}%`} testID="owner-ontime-ring" />
                  <Text style={styles.ringLabel}>On time</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.tiles}>
                <Tile label="Owes you" value={p.stats.owed ? money(p.stats.owed, p.stats.currency) : "—"} color={colors.brandPrimary} />
                <Tile label="Recovered" value={p.stats.recovered ? money(p.stats.recovered, p.stats.currency) : "—"} color={colors.success} />
                <Tile label="Overdue" value={String(p.stats.overdue)} color={p.stats.overdue ? colors.error : colors.muted} />
                <Tile label="Avg. late" value={p.stats.avgDaysLate ? `${p.stats.avgDaysLate}d` : "0d"} color={colors.warning} />
              </View>
              {p.open.length > 0 ? (
                <Button
                  title={p.open.length === 1 ? "Follow up" : `Follow up on all ${p.open.length}`}
                  icon="chatbubbles-outline"
                  onPress={() => router.push(`/followup/${OWNER_PREFIX}${encodeURIComponent(p.ownerName)}`)}
                  testID="owner-bulk-followup-button"
                  style={{ height: 46 }}
                />
              ) : null}
              <Text style={styles.meta}>
                {p.stats.remindersSent} {p.stats.remindersSent === 1 ? "reminder" : "reminders"} sent · {p.stats.followups} {p.stats.followups === 1 ? "follow-up" : "follow-ups"}
              </Text>
            </View>

            <SectionTitle title="Still owed" count={p.open.length} />
            {p.open.length === 0 ? <Text style={styles.empty}>Nothing open with {p.ownerName}.</Text> : p.open.map((it) => <AwaitCard key={it.id} item={it} />)}

            <SectionTitle title="History" count={p.done.length} />
            {p.done.length === 0 ? <Text style={styles.empty}>No completed Awaits yet.</Text> : p.done.map((it) => <AwaitCard key={it.id} item={it} showClosed />)}

            {p.recent.length ? (
              <View style={styles.card} testID="owner-activity">
                <Text style={styles.cardTitle}>Recent activity</Text>
                {p.recent.map((e, i) => (
                  <Pressable key={e.id} onPress={() => router.push(`/item/${e.awaitItemId}`)} style={[styles.evt, i < p.recent.length - 1 && styles.evtDivider]}>
                    <Icon name="ellipse" size={8} color={colors.brandPrimary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.evtText}>{e.text}</Text>
                      <Text style={styles.evtDate}>{dayjs(e.createdAt).format("D MMM, h:mm A")}</Text>
                    </View>
                    <Text style={styles.evtDate}>{fromNow(e.createdAt)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.lg, gap: 10, paddingTop: 4 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 12 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { fontSize: 20, fontWeight: "800", color: c.onSurface, letterSpacing: -0.2 },
  sub: { fontSize: 13, color: c.muted },
  ringLabel: { fontSize: 11.5, color: c.muted },
  divider: { height: 1, backgroundColor: c.divider },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", gap: 2 },
  tileValue: { fontSize: 15, fontWeight: "800" },
  tileLabel: { fontSize: 11, color: c.muted },
  meta: { fontSize: 12.5, color: c.muted },
  empty: { color: c.muted, fontSize: 13.5, paddingVertical: 8 },
  cardTitle: { fontSize: 16.5, fontWeight: "800", color: c.onSurface },
  evt: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  evtDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  evtText: { fontSize: 13.5, fontWeight: "600", color: c.onSurface },
  evtDate: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
