import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { EmptyState, Icon, IconBox, Pill, ScreenHeader } from "@/src/components/ui";
import { ErrorRetry } from "@/src/components/common";
import { api } from "@/src/api";
import { money } from "@/src/format";
import { trackRecord, type OwnerStats } from "@/app/owner/[name]";

type OwnerRow = OwnerStats & { ownerName: string; key: string; categories: string[] };

export default function Owners() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const q = useQuery({ queryKey: ["owners"], queryFn: () => api<OwnerRow[]>("/owners") });
  const rows = q.data ?? [];
  const totalOwed = rows.reduce((s, r) => s + (r.owed || 0), 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="owners-screen">
      <ScreenHeader title="People & Companies" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
        {q.isError ? <ErrorRetry onRetry={q.refetch} /> : null}
        {!q.isLoading && rows.length === 0 ? <EmptyState testID="owners-empty" icon="people-outline" title="Nobody yet" subtitle="Everyone who owes you something shows up here with their track record." /> : null}
        {rows.length ? (
          <Text style={styles.summary} testID="owners-summary">
            {rows.length} {rows.length === 1 ? "party" : "parties"}{totalOwed ? ` · ${money(totalOwed, rows.find((r) => r.owed)?.currency)} owed to you` : ""}
          </Text>
        ) : null}
        {rows.map((r) => {
          const rec = trackRecord(r);
          return (
            <Pressable key={r.key} testID={`owner-row-${r.key.replace(/\s+/g, "-")}`} onPress={() => router.push(`/owner/${encodeURIComponent(r.ownerName)}`)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
              <IconBox letter={r.ownerName.charAt(0).toUpperCase()} tone={r.overdue ? "error" : r.open ? "brand" : "neutral"} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>{r.ownerName}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {r.open} open · {r.done} done{r.owed ? ` · ${money(r.owed, r.currency)} owed` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Pill text={rec.label} tone={rec.tone} />
                {r.overdue ? <Text style={styles.overdue}>{r.overdue} overdue</Text> : null}
              </View>
              <Icon name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.lg, gap: 10, paddingTop: 4 },
  summary: { fontSize: 13, color: c.muted, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md },
  name: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 12.5, color: c.muted },
  overdue: { fontSize: 11.5, color: c.error, fontWeight: "600" },
}));
