import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Icon, IconBox, Pill, ScreenHeader } from "@/src/components/ui";
import { ErrorRetry } from "@/src/components/common";
import { CATEGORY_TONE } from "@/src/components/AwaitCard";
import { useRecap, type RecapItem } from "@/src/hooks";
import { fromNow } from "@/src/format";

export default function WeeklyRecap() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const q = useRecap();
  const r = q.data;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="recap-screen">
      <ScreenHeader title="Weekly Recap" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
        {q.isError ? <ErrorRetry onRetry={q.refetch} /> : null}
        {r ? (
          <>
            <View style={styles.heroCard} testID="recap-hero">
              <Text style={styles.range}>{dayjs(r.weekStart).format("D MMM")} – {dayjs(r.weekEnd).format("D MMM")}</Text>
              <Text style={styles.headline} testID="recap-headline">{r.headline}</Text>
              <View style={styles.tiles}>
                <Tile icon="checkmark-done-outline" label="Resolved" value={r.counts.resolved} color={colors.success} />
                <Tile icon="trending-down-outline" label="Slipped" value={r.counts.slipped} color={colors.error} />
                <Tile icon="paper-plane-outline" label="Follow-ups" value={r.counts.followups} color={colors.brandPrimary} />
                <Tile icon="hourglass-outline" label="Still open" value={r.counts.open} color={colors.warning} />
              </View>
            </View>

            <Section title="Who owes you the most" count={r.owes.length} testID="recap-owes">
              {r.owes.length === 0 ? <Text style={styles.empty}>Nobody — everything is settled.</Text> : null}
              {r.owes.map((o, i) => (
                <Pressable key={o.ownerName} testID={`recap-owes-${i}`} onPress={() => router.push({ pathname: "/(tabs)/search", params: { q: o.ownerName } })} style={[styles.row, i < r.owes.length - 1 && styles.rowDivider]}>
                  <View style={styles.rank}><Text style={styles.rankText}>{i + 1}</Text></View>
                  <IconBox letter={o.ownerName.charAt(0).toUpperCase()} tone={o.overdue ? "error" : "brand"} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{o.ownerName}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{o.items.join(" · ")}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={styles.count}>{o.count} {o.count === 1 ? "open" : "open"}</Text>
                    {o.overdue ? <Pill text={`${o.overdue} overdue`} tone="error" /> : o.oldestExpectedAt ? <Text style={styles.rowSub}>since {dayjs(o.oldestExpectedAt).format("D MMM")}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </Section>

            <Section title="Slipped this week" count={r.slipped.length} testID="recap-slipped">
              {r.slipped.length === 0 ? <Text style={styles.empty}>Nothing slipped. Nice.</Text> : null}
              {r.slipped.map((it, i) => (
                <ItemRow key={it.id} item={it} last={i === r.slipped.length - 1} right={<Pill text={it.attentionState === "OVERDUE" ? "Overdue" : "Date moved"} tone={it.attentionState === "OVERDUE" ? "error" : "warning"} />} />
              ))}
            </Section>

            <Section title="Resolved this week" count={r.resolved.length} testID="recap-resolved">
              {r.resolved.length === 0 ? <Text style={styles.empty}>Nothing closed yet this week.</Text> : null}
              {r.resolved.map((it, i) => (
                <ItemRow key={it.id} item={it} last={i === r.resolved.length - 1} right={<Text style={styles.rowSub}>{fromNow(it.completedAt)}</Text>} />
              ))}
            </Section>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Tile({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Icon name={icon} size={18} color={color} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, count, children, testID }: { title: string; count: number; children: React.ReactNode; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{count}</Text>
      </View>
      {children}
    </View>
  );
}

function ItemRow({ item, right, last }: { item: RecapItem; right: React.ReactNode; last: boolean }) {
  const styles = useStyles();
  const router = useRouter();
  return (
    <Pressable testID={`recap-item-${item.id}`} onPress={() => router.push(`/item/${item.id}`)} style={[styles.row, !last && styles.rowDivider]}>
      <IconBox letter={item.ownerName.charAt(0).toUpperCase()} tone={CATEGORY_TONE[item.category] ?? "neutral"} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.ownerName}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{item.commitment}</Text>
      </View>
      {right}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.lg, gap: 12, paddingTop: 4 },
  heroCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 8 },
  range: { fontSize: 12.5, color: c.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  headline: { fontSize: 20, fontWeight: "800", color: c.onSurface, lineHeight: 26 },
  tiles: { flexDirection: "row", gap: 8, marginTop: 8 },
  tile: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 10, alignItems: "center", gap: 4 },
  tileValue: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  tileLabel: { fontSize: 11, color: c.muted },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  cardTitle: { fontSize: 16.5, fontWeight: "800", color: c.onSurface },
  cardMeta: { fontSize: 12.5, color: c.muted },
  empty: { color: c.muted, fontSize: 13.5, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  rank: { width: 20, alignItems: "center" },
  rankText: { fontSize: 13, fontWeight: "800", color: c.muted },
  rowTitle: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  rowSub: { fontSize: 12.5, color: c.muted, marginTop: 2 },
  count: { fontSize: 13, fontWeight: "700", color: c.onSurface },
}));
