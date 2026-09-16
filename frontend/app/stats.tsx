import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { ScreenHeader, IconBox } from "@/src/components/ui";
import { useStats } from "@/src/hooks";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/src/types";
import { categoryIcon } from "@/src/format";
import { CATEGORY_TONE } from "@/src/components/AwaitCard";

export default function Stats() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const q = useStats();
  const s = q.data;
  const total = s?.total ?? 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  const segs = s ? [
    { v: s.done, color: colors.success },
    { v: Math.max(s.waiting - s.overdue, 0), color: colors.warning },
    { v: s.overdue, color: colors.error },
  ] : [];
  let offset = 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="stats-screen">
      <ScreenHeader title="My Progress" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {q.isLoading || !s ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
                <View style={{ width: 132, height: 132, alignItems: "center", justifyContent: "center" }} testID="stats-donut">
                  <Svg width={132} height={132} viewBox="0 0 132 132">
                    <Circle cx={66} cy={66} r={R} stroke={colors.surfaceTertiary} strokeWidth={14} fill="none" />
                    {segs.map((seg, i) => {
                      const len = total ? (seg.v / total) * C : 0;
                      const el = <Circle key={i} cx={66} cy={66} r={R} stroke={seg.color} strokeWidth={14} fill="none" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} rotation={-90} origin="66,66" strokeLinecap="butt" />;
                      offset += len;
                      return el;
                    })}
                  </Svg>
                  <View style={{ position: "absolute", alignItems: "center" }}>
                    <Text style={styles.big} testID="stats-total">{total}</Text>
                    <Text style={styles.small}>Total items</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 10 }}>
                  <Legend color={colors.success} label="Done" value={s.done} testID="stats-done" />
                  <Legend color={colors.warning} label="Waiting" value={s.waiting} testID="stats-waiting" />
                  <Legend color={colors.error} label="Overdue" value={s.overdue} testID="stats-overdue" />
                </View>
              </View>
            </View>

            <View style={styles.grid}>
              <Tile label="My Turn" value={s.myTurn} />
              <Tile label="Needs Review" value={s.needsReview} />
              {s.activeLimit ? <Tile label="Free limit" value={`${s.waiting}/${s.activeLimit}`} /> : <Tile label="Plan" value="Pro" />}
            </View>

            <Text style={styles.section}>Category breakdown</Text>
            <View style={styles.card}>
              {CATEGORIES.map((c: Category, i) => {
                const v = s.categories?.[c] ?? 0;
                const pct = total ? v / total : 0;
                return (
                  <View key={c} style={[styles.catRow, i < CATEGORIES.length - 1 && styles.catDivider]} testID={`stats-cat-${c.toLowerCase()}`}>
                    <IconBox name={categoryIcon(c)} tone={CATEGORY_TONE[c]} size={34} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={styles.catLabel}>{CATEGORY_LABEL[c]}</Text>
                        <Text style={styles.catValue}>{v}</Text>
                      </View>
                      <View style={styles.bar}>
                        <View style={[styles.barFill, { width: `${Math.max(pct * 100, v ? 4 : 0)}%` }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Legend({ color, label, value, testID }: { color: string; label: string; value: number; testID: string }) {
  const styles = useStyles();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} testID={testID}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={styles.legend}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 12 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg },
  big: { fontSize: 28, fontWeight: "800", color: c.onSurface },
  small: { fontSize: 11.5, color: c.muted },
  legend: { flex: 1, color: c.onSurfaceSecondary, fontSize: 14 },
  legendValue: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  grid: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 12, alignItems: "center", gap: 2 },
  tileValue: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  tileLabel: { fontSize: 11.5, color: c.muted, textAlign: "center" },
  section: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  catDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  catLabel: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  catValue: { fontSize: 14, fontWeight: "700", color: c.muted },
  bar: { height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: c.brandPrimary },
}));
