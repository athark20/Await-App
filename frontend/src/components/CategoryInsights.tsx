import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { makeStyles, radius, useTheme } from "@/src/theme";
import { Icon, IconBox } from "@/src/components/ui";
import { api } from "@/src/api";
import { categoryIcon, money } from "@/src/format";
import { CATEGORY_LABEL, type Category } from "@/src/types";

interface CatRow {
  category: Category;
  total: number;
  open: number;
  overdue: number;
  judged: number;
  slipped: number;
  slipRate: number | null;
  avgDaysLate: number;
  worstOwner: string | null;
  owed: number;
}

/** "What slips most": per-category slip rate with who to chase early. */
export function CategoryInsights() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ["stats", "categories"], queryFn: () => api<{ categories: CatRow[]; tips: string[]; currency: string }>("/stats/categories") });
  const rows = q.data?.categories ?? [];
  const color = (r: number | null) => (r === null ? colors.muted : r >= 0.5 ? colors.error : r > 0 ? colors.warning : colors.success);

  return (
    <View style={styles.card} testID="stats-insights">
      <Text style={styles.title}>What slips most</Text>
      <Text style={styles.sub}>Share of promises that ran late, by kind. Learn who and what to chase early.</Text>
      {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
      {q.data?.tips.map((t, i) => (
        <View key={i} style={styles.tip} testID={`stats-insight-tip-${i}`}>
          <Icon name="bulb-outline" size={16} color={colors.warning} />
          <Text style={styles.tipText}>{t}</Text>
        </View>
      ))}
      {rows.map((r, i) => (
        <View key={r.category} style={[styles.row, i < rows.length - 1 && styles.rowDivider]} testID={`stats-insight-${r.category}`}>
          <IconBox name={categoryIcon(r.category)} size={38} tone={r.slipRate && r.slipRate >= 0.5 ? "error" : r.slipRate ? "warning" : "success"} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.rowHead}>
              <Text style={styles.name}>{CATEGORY_LABEL[r.category]}</Text>
              <Text style={[styles.rate, { color: color(r.slipRate) }]}>{r.slipRate === null ? "no dates yet" : `${Math.round(r.slipRate * 100)}% slip`}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round((r.slipRate ?? 0) * 100)}%`, backgroundColor: color(r.slipRate) }]} />
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {r.total} total · {r.open} open{r.avgDaysLate ? ` · avg ${r.avgDaysLate}d late` : ""}{r.owed ? ` · ${money(r.owed, q.data?.currency)} owed` : ""}
            </Text>
            {r.worstOwner ? (
              <Pressable testID={`stats-insight-chase-${r.category}`} onPress={() => router.push(`/owner/${encodeURIComponent(r.worstOwner!)}`)} style={styles.chase}>
                <Icon name="flag-outline" size={12} color={colors.brandPrimary} />
                <Text style={styles.chaseText}>Chase {r.worstOwner} early</Text>
                <Icon name="chevron-forward" size={12} color={colors.brandPrimary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {!q.isLoading && rows.length === 0 ? <Text style={styles.meta}>Add a few Awaits with expected dates to see patterns.</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 16, gap: 10 },
  title: { fontSize: 16.5, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 12.5, color: c.muted, marginTop: -6 },
  tip: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: c.warningTint, borderRadius: radius.md, padding: 10 },
  tipText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 18 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  rate: { fontSize: 12.5, fontWeight: "700" },
  track: { height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  meta: { fontSize: 12, color: c.muted },
  chase: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 2 },
  chaseText: { fontSize: 12.5, fontWeight: "700", color: c.brandPrimary },
}));
