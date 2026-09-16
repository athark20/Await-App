import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, IconBox, ScreenHeader, EmptyState } from "@/src/components/ui";
import { CATEGORY_TONE } from "@/src/components/AwaitCard";
import { RemindLaterSheet } from "@/app/capture/match";
import { useAwaits, useInvalidateAwaits } from "@/src/hooks";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import type { AwaitItem } from "@/src/types";

export default function NeedsReview() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const invalidate = useInvalidateAwaits();
  const q = useAwaits({ include_done: "false" });
  const items = (q.data ?? []).filter((i) => i.attentionState === "NEEDS_REVIEW" || i.attentionState === "POSSIBLE_RESOLUTION" || i.ignoredReminderCount >= 3);
  const [remindFor, setRemindFor] = useState<string | null>(null);

  const reason = (it: AwaitItem) => {
    if (it.attentionState === "POSSIBLE_RESOLUTION") return "Possible resolution detected";
    if (it.ignoredReminderCount >= 3) return `${it.ignoredReminderCount} reminders ignored`;
    const silent = dayjs().diff(dayjs(it.updatedAt), "day");
    if (it.expectedAt && dayjs(it.expectedAt).isBefore(dayjs())) return silent >= 8 ? `No update for ${silent} days` : "Past expected date";
    return "Needs your attention";
  };

  const act = async (id: string, path: string, json?: any, msg?: string) => {
    await api(`/awaits/${id}${path}`, { method: "POST", json });
    invalidate(id);
    if (msg) toast.show(msg, "success");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="needs-review-screen">
      <ScreenHeader title="Needs Review" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.sub}>Await paused repeated reminders for these items.</Text>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 32 }} /> : null}
        {!q.isLoading && items.length === 0 ? <EmptyState testID="needs-review-empty" icon="checkmark-done-outline" tone="success" title="Nothing to review" subtitle="Items land here when reminders keep getting ignored or go quiet for a while." /> : null}
        {items.map((it) => (
          <View key={it.id} style={styles.card} testID={`review-card-${it.id}`}>
            <Pressable onPress={() => router.push(`/item/${it.id}`)} style={styles.head}>
              <IconBox letter={it.ownerName.charAt(0).toUpperCase()} tone={CATEGORY_TONE[it.category]} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.owner}>{it.ownerName}</Text>
                <Text style={styles.what}>{it.commitment}</Text>
                <Text style={styles.reason}>{reason(it)}</Text>
              </View>
            </Pressable>
            <View style={styles.actions}>
              <Button small title="Review" variant="secondary" onPress={() => router.push(`/item/${it.id}`)} testID={`review-open-${it.id}`} style={{ flex: 1 }} />
              <Button small title="Remind later" variant="secondary" onPress={() => setRemindFor(it.id)} testID={`review-remind-${it.id}`} style={{ flex: 1 }} />
            </View>
            <View style={styles.actions}>
              <Button small title="Follow Up" variant="outline" icon="chatbubble-ellipses-outline" onPress={() => router.push(`/followup/${it.id}`)} testID={`review-followup-${it.id}`} style={{ flex: 1 }} />
              <Button small title="Mark Done" variant="success" icon="checkmark" onPress={() => act(it.id, "/state", { state: "DONE" }, "Marked as Done")} testID={`review-done-${it.id}`} style={{ flex: 1 }} />
            </View>
          </View>
        ))}
      </ScrollView>
      <RemindLaterSheet visible={!!remindFor} onClose={() => setRemindFor(null)} onPick={(d) => { const id = remindFor!; setRemindFor(null); act(id, "/snooze", { days: d }, "Reminder scheduled"); }} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 12 },
  sub: { color: c.muted, fontSize: 14 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 12, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  owner: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  what: { fontSize: 13.5, color: c.onSurfaceSecondary },
  reason: { fontSize: 12.5, color: c.purple, fontWeight: "600", marginTop: 2 },
  actions: { flexDirection: "row", gap: 8 },
}));
