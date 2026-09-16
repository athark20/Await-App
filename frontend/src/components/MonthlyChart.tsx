import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, radius, useTheme } from "@/src/theme";
import { Chips } from "@/src/components/ui";
import { api } from "@/src/api";
import { money } from "@/src/format";

interface Month {
  month: string;
  label: string;
  opened: number;
  closed: number;
  owed: number;
  recovered: number;
}
type Mode = "items" | "money";

/** Monthly bars: Awaits opened vs closed (default) or money owed vs recovered. */
export function MonthlyChart() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>("items");
  const q = useQuery({ queryKey: ["stats", "monthly"], queryFn: () => api<{ months: Month[]; currency: string }>("/stats/monthly") });
  const months = q.data?.months ?? [];
  const cur = q.data?.currency;
  const a = (m: Month) => (mode === "items" ? m.opened : m.owed);
  const b = (m: Month) => (mode === "items" ? m.closed : m.recovered);
  const max = Math.max(1, ...months.flatMap((m) => [a(m), b(m)]));
  const H = 96;
  const totalA = months.reduce((s, m) => s + a(m), 0);
  const totalB = months.reduce((s, m) => s + b(m), 0);
  const fmt = (v: number) => (mode === "items" ? String(v) : money(v, cur) || "0");

  return (
    <View style={styles.card} testID="stats-monthly">
      <View style={styles.head}>
        <Text style={styles.title}>Last 6 months</Text>
        <Chips<Mode> testID="stats-monthly-mode" value={mode} onChange={setMode} options={[{ key: "items", label: "Awaits" }, { key: "money", label: "Money" }]} />
      </View>
      {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
      {months.length ? (
        <>
          <View style={[styles.chart, { height: H + 22 }]}>
            {months.map((m) => (
              <View key={m.month} style={styles.col} testID={`stats-month-${m.month}`}>
                <View style={[styles.bars, { height: H }]}>
                  <View style={[styles.bar, { height: Math.max(a(m) ? 4 : 2, (a(m) / max) * H), backgroundColor: a(m) ? colors.brandPrimary : colors.surfaceTertiary }]} />
                  <View style={[styles.bar, { height: Math.max(b(m) ? 4 : 2, (b(m) / max) * H), backgroundColor: b(m) ? colors.success : colors.surfaceTertiary }]} />
                </View>
                <Text style={styles.month}>{m.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.brandPrimary }]} />
              <Text style={styles.legendText}>{mode === "items" ? "Opened" : "Owed"} · {fmt(totalA)}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>{mode === "items" ? "Closed" : "Recovered"} · {fmt(totalB)}</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 16, gap: 12 },
  head: { gap: 8 },
  title: { fontSize: 16.5, fontWeight: "800", color: c.onSurface },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  col: { flex: 1, alignItems: "center", gap: 6 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  bar: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  month: { fontSize: 11.5, color: c.muted },
  legend: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12.5, color: c.onSurfaceSecondary, fontWeight: "600" },
}));
