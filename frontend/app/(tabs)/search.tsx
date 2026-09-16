import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Chips, Icon, EmptyState } from "@/src/components/ui";
import { AwaitCard } from "@/src/components/AwaitCard";
import { useAwaits } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/src/types";

type StateF = "ALL" | "MY_TURN" | "THEIR_TURN" | "DONE";
type TimeF = "ANY" | "overdue" | "week" | "month";
type Sort = "due" | "recent" | "az";

export default function Search() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [state, setState] = useState<StateF>("ALL");
  const [cat, setCat] = useState<Category | "ALL">("ALL");
  const [time, setTime] = useState<TimeF>("ANY");
  const [sort, setSort] = useState<Sort>("due");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const res = useAwaits({
    q: q.trim() || undefined,
    state: state === "ALL" ? undefined : state,
    category: cat === "ALL" ? undefined : cat,
    time: time === "ANY" ? undefined : time,
    sort,
  });
  const items = res.data ?? [];

  return (
    <View style={styles.root} testID="search-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchBox}>
          <Icon name="search-outline" size={18} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Search people, items, or notes…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} testID="search-clear" hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Chips<StateF>
          testID="search-state"
          value={state}
          onChange={setState}
          options={[
            { key: "ALL", label: "All" },
            { key: "MY_TURN", label: "My Turn" },
            { key: "THEIR_TURN", label: "Their Turn" },
            { key: "DONE", label: "Done" },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Categories</Text>
        <Chips<Category | "ALL">
          testID="search-category"
          value={cat}
          onChange={setCat}
          options={[{ key: "ALL", label: "All" }, ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c] }))]}
        />
        <Text style={styles.label}>Time</Text>
        <Chips<TimeF>
          testID="search-time"
          value={time}
          onChange={setTime}
          options={[
            { key: "ANY", label: "Any time" },
            { key: "overdue", label: "Overdue" },
            { key: "week", label: "Due this week" },
            { key: "month", label: "Due this month" },
          ]}
        />
        <View style={styles.sortRow}>
          <Text style={styles.label}>Sort</Text>
          <Chips<Sort>
            testID="search-sort"
            value={sort}
            onChange={setSort}
            options={[
              { key: "due", label: "Due date" },
              { key: "recent", label: "Recently added" },
              { key: "az", label: "A–Z" },
            ]}
          />
        </View>
        <Text style={[styles.label, { marginTop: 8, marginBottom: 8 }]} testID="search-result-count">
          {res.isLoading ? "Searching…" : `${items.length} ${items.length === 1 ? "result" : "results"}`}
        </Text>
        {res.isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
        ) : items.length === 0 ? (
          <EmptyState testID="search-empty" icon="search-outline" tone="neutral" title="No matches" subtitle="Try a different name, keyword or filter." />
        ) : (
          items.map((it) => <AwaitCard key={it.id} item={it} showClosed />)
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, paddingHorizontal: spacing.xl, marginBottom: 10 },
  searchBox: { marginHorizontal: spacing.xl, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: c.onSurface, height: 48 },
  content: { paddingHorizontal: spacing.xl },
  label: { fontSize: 13, fontWeight: "700", color: c.onSurfaceTertiary, marginTop: 6 },
  sortRow: {},
}));
