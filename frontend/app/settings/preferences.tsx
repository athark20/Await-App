import React, { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { makeStyles, spacing } from "@/src/theme";
import { Group, ListRow, ScreenHeader, Chips } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { usePrefs, type Appearance, type Schedule } from "@/src/prefs";

const fmtHour = (h: number) => dayjs().hour(h).minute(0).format("h A");

const PHASE_META: { key: keyof Schedule; label: string; icon: string; hours: number[] }[] = [
  { key: "morning", label: "Morning starts", icon: "partly-sunny-outline", hours: [4, 5, 6, 7, 8] },
  { key: "afternoon", label: "Afternoon starts", icon: "sunny-outline", hours: [10, 11, 12, 13, 14] },
  { key: "dusk", label: "Dusk starts", icon: "cloudy-night-outline", hours: [15, 16, 17, 18, 19] },
  { key: "night", label: "Night starts", icon: "moon-outline", hours: [18, 19, 20, 21, 22, 23] },
];

export default function Preferences() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { prefs, update } = usePrefs();
  const [editPhase, setEditPhase] = useState<keyof Schedule | null>(null);
  const meta = PHASE_META.find((m) => m.key === editPhase);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="preferences-screen">
      <ScreenHeader title="Preferences" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.section}>Appearance</Text>
        <Group>
          {(["system", "light", "dark", "timeofday"] as Appearance[]).map((a, i, arr) => (
            <ListRow
              key={a}
              testID={`appearance-${a}`}
              icon={a === "system" ? "phone-portrait-outline" : a === "light" ? "sunny-outline" : a === "dark" ? "moon-outline" : "partly-sunny-outline"}
              title={a === "timeofday" ? "Auto · time of day" : a.charAt(0).toUpperCase() + a.slice(1)}
              subtitle={a === "system" ? "Follow device setting" : a === "timeofday" ? "Sky wallpaper + theme shift through the day" : undefined}
              value={prefs.appearance === a ? "✓" : undefined}
              onPress={() => update({ appearance: a })}
              last={i === arr.length - 1}
            />
          ))}
        </Group>
        {prefs.appearance === "timeofday" ? (
          <>
            <Text style={styles.section}>Theme schedule</Text>
            <Group>
              {PHASE_META.map((m, i) => (
                <ListRow
                  key={m.key}
                  testID={`schedule-${m.key}`}
                  icon={m.icon}
                  title={m.label}
                  value={fmtHour(prefs.schedule[m.key])}
                  onPress={() => setEditPhase(m.key)}
                  last={i === PHASE_META.length - 1}
                />
              ))}
            </Group>
            <Text style={styles.note}>Morning & afternoon show bright sky · dusk dims to a sunset · night goes dark & starry.</Text>
          </>
        ) : null}
        <Text style={styles.section}>Calendar</Text>
        <Group>
          <ListRow
            testID="pref-calendar-sync"
            icon="calendar-outline"
            title="Add new Awaits to my calendar"
            subtitle={Platform.OS === "web" ? "Works on your phone: promised dates appear next to your meetings" : "Promised dates appear next to your meetings (syncs with Google Calendar)"}
            toggle={prefs.calendarSync}
            onToggle={(v) => update({ calendarSync: v })}
            last
          />
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
        <Text style={styles.note}>Light, dim and dark share the same layout — only colors change.</Text>
      </ScrollView>
      <Sheet
        visible={!!meta}
        onClose={() => setEditPhase(null)}
        icon={meta?.icon}
        title={meta ? meta.label : ""}
        subtitle="Pick the hour this part of the day begins."
        testID="schedule-sheet"
        options={(meta?.hours ?? []).map((h) => ({ key: String(h), label: fmtHour(h), subtitle: prefs.schedule[meta!.key] === h ? "Current" : undefined, icon: "time-outline" }))}
        onSelect={(k) => {
          if (meta) update({ schedule: { ...prefs.schedule, [meta.key]: parseInt(k, 10) } });
          setEditPhase(null);
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.xl, gap: 10 },
  section: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
  note: { fontSize: 12.5, color: c.muted, marginTop: 8 },
}));
