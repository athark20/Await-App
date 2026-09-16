import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing } from "@/src/theme";
import { Group, ListRow, ScreenHeader, Chips } from "@/src/components/ui";
import { usePrefs, type Appearance } from "@/src/prefs";

export default function Preferences() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { prefs, update } = usePrefs();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="preferences-screen">
      <ScreenHeader title="Preferences" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.section}>Appearance</Text>
        <Group>
          {(["system", "light", "dark"] as Appearance[]).map((a, i) => (
            <ListRow
              key={a}
              testID={`appearance-${a}`}
              icon={a === "system" ? "phone-portrait-outline" : a === "light" ? "sunny-outline" : "moon-outline"}
              title={a.charAt(0).toUpperCase() + a.slice(1)}
              subtitle={a === "system" ? "Follow device setting" : undefined}
              value={prefs.appearance === a ? "✓" : undefined}
              onPress={() => update({ appearance: a })}
              last={i === 2}
            />
          ))}
        </Group>
        <Text style={styles.section}>Default snooze</Text>
        <Chips<string>
          testID="snooze"
          value={String(prefs.defaultSnoozeDays)}
          onChange={(v) => update({ defaultSnoozeDays: parseInt(v, 10) })}
          options={[{ key: "1", label: "Tomorrow" }, { key: "3", label: "3 days" }, { key: "7", label: "Next week" }]}
        />
        <Text style={styles.section}>Date format</Text>
        <Chips<string>
          testID="dateformat"
          value={prefs.dateFormat}
          onChange={(v) => update({ dateFormat: v as any })}
          options={[{ key: "DMY", label: "16 Sep 2025" }, { key: "MDY", label: "Sep 16, 2025" }]}
        />
        <Text style={styles.note}>Light and dark share the same layout — only colors change.</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 10 },
  section: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
  note: { fontSize: 12.5, color: c.muted, marginTop: 8 },
}));
