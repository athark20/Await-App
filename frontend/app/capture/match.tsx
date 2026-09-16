import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { makeStyles, radius, spacing } from "@/src/theme";
import { Button, IconBox, Pill, ScreenHeader } from "@/src/components/ui";
import { AwaitCard } from "@/src/components/AwaitCard";
import { Sheet } from "@/src/components/Sheet";
import { SnoozeSheet } from "@/src/components/SnoozeSheet";
import type { AwaitItem } from "@/src/types";
import { captureStore, itemsToEvidence } from "@/src/capture-store";
import { api } from "@/src/api";
import { useInvalidateAwaits } from "@/src/hooks";
import { useToast } from "@/src/components/Toast";
import { fmtDate } from "@/src/format";
import { cancelReminder, scheduleReminder } from "@/src/notifications";

/** Decides between: Related Await Found (65–84%) · Update Found (≥85%) · Likely Resolved (completion signal). */
export default function Match() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAwaits();
  const payload = captureStore.get();
  const match = payload?.match;
  const ex = payload?.extraction;
  const [busy, setBusy] = useState<string | null>(null);
  const [remindSheet, setRemindSheet] = useState(false);
  const [evidenceSheet, setEvidenceSheet] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!payload || !match) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader title="Shared to Await" />
        <Text style={styles.muted}>Nothing to match.</Text>
      </View>
    );
  }

  const cand = match.candidate;
  const rel = match.relationshipConfidence;
  const completion = Math.max(match.completionSignalConfidence, ex?.completion_signal ? 0.9 : 0);
  const isResolution = completion >= 0.7 && (rel >= 0.85 || confirmed);
  const needsConfirm = rel < 0.85 && !confirmed;
  const evidence = itemsToEvidence(payload.items)[0];
  const newDate = match.suggestedChanges?.expected_at ?? ex?.expected_at ?? null;
  const newText = match.suggestedChanges?.expected_text ?? ex?.expected_text ?? null;
  const sourceText = payload.items[0]?.text ?? payload.items[0]?.fileName ?? "Shared content";

  const finish = (id: string, msg: string) => {
    invalidate(id);
    captureStore.clear();
    toast.show(msg, "success");
    router.dismissAll?.();
    router.replace(`/item/${id}`);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast.show(e?.message ?? "Something went wrong", "error");
    } finally {
      setBusy(null);
    }
  };

  const createNew = () => {
    captureStore.patch({ match: null });
    router.replace("/capture/confirm");
  };

  // ---------------------------------------------------------------- Related Await Found (65–84%)
  if (needsConfirm) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="related-found-screen">
        <ScreenHeader title="Shared to Await" />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <IconBox name="git-compare-outline" size={72} />
          </View>
          <Text style={styles.title}>Related Await Found</Text>
          <Text style={styles.sub}>This update may belong to:</Text>
          <AwaitCard item={cand} onPress={() => {}} />
          <View style={styles.confRow}>
            <Pill text={`${Math.round(rel * 100)}% match`} tone="brand" testID="match-confidence" />
            {match.shortExplanation ? <Text style={styles.explain}>{match.shortExplanation}</Text> : null}
          </View>
          <SourceBox text={sourceText} />
          <Button title="Yes, use this Await" onPress={() => setConfirmed(true)} testID="related-yes-button" style={{ marginTop: 8 }} />
          <Button title="No, create a new Await" variant="outline" onPress={createNew} testID="related-no-button" />
        </ScrollView>
      </View>
    );
  }

  // ---------------------------------------------------------------- Likely Resolved
  if (isResolution) {
    const pct = Math.round(completion * 100);
    const act = (action: "close" | "still_waiting" | "remind_later", days?: number) =>
      run(action, async () => {
        if (action === "close") {
          await api(`/awaits/${cand.id}/resolution`, { method: "POST", json: { action, evidence } });
          cancelReminder(cand.id);
          finish(cand.id, "Marked as Done");
        } else if (action === "remind_later") {
          const it = await api(`/awaits/${cand.id}/resolution`, { method: "POST", json: { action, days, evidence } });
          scheduleReminder(it);
          finish(cand.id, "Reminder scheduled");
        } else {
          await api(`/awaits/${cand.id}/resolution`, { method: "POST", json: { action, evidence } });
          finish(cand.id, "Kept active — still waiting");
        }
      });
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="possible-resolution-screen">
        <ScreenHeader title="Shared to Await" />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <IconBox name="checkmark-circle-outline" tone="success" size={80} />
          </View>
          <Text style={styles.title}>Likely Resolved</Text>
          <Text style={styles.sub}>Shared update detected</Text>
          <AwaitCard item={cand} onPress={() => {}} />
          <View style={styles.quoteCard}>
            <Text style={styles.quote}>“{match.shortExplanation || `The update you shared says ${cand.commitment.toLowerCase()} has been completed.`}”</Text>
          </View>
          <View style={styles.confRow}>
            <Text style={styles.confLabel}>Confidence</Text>
            <Pill text={`${pct}%`} tone="success" testID="resolution-confidence" />
          </View>
          <Text style={styles.neverAuto}>Await never closes an item automatically. Please confirm.</Text>
          <Button title="Yes, close it" variant="success" onPress={() => act("close")} loading={busy === "close"} testID="resolution-close-button" style={{ marginTop: 4 }} />
          <Button title="Still waiting" variant="outline" onPress={() => act("still_waiting")} loading={busy === "still_waiting"} testID="resolution-still-waiting-button" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button title="View evidence" variant="secondary" icon="eye-outline" onPress={() => setEvidenceSheet(true)} testID="resolution-view-evidence-button" style={{ flex: 1 }} />
            <Button title="Remind later" variant="secondary" icon="alarm-outline" onPress={() => setRemindSheet(true)} testID="resolution-remind-later-button" style={{ flex: 1 }} />
          </View>
        </ScrollView>
        <Sheet visible={evidenceSheet} onClose={() => setEvidenceSheet(false)} title="Shared evidence" subtitle="Exactly what you shared into Await" testID="evidence-sheet">
          <SourceBox text={sourceText} />
        </Sheet>
        <RemindLaterSheet item={cand} visible={remindSheet} onClose={() => setRemindSheet(false)} onPick={(d) => { setRemindSheet(false); act("remind_later", d); }} />
      </View>
    );
  }

  // ---------------------------------------------------------------- Update Found (≥85%, non-resolution)
  const applyUpdate = () =>
    run("update", async () => {
      const it = await api(`/awaits/${cand.id}/apply-update`, { method: "POST", json: { expectedAt: newDate, expectedText: newText, evidence } });
      scheduleReminder(it);
      finish(cand.id, "Await updated");
    });
  const keepDate = () =>
    run("keep", async () => {
      await api(`/awaits/${cand.id}/apply-update`, { method: "POST", json: { evidence } });
      finish(cand.id, "Evidence added, date kept");
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="update-found-screen">
      <ScreenHeader title="Shared to Await" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <IconBox name="refresh-circle-outline" tone="warning" size={72} />
        </View>
        <Text style={styles.title}>Update Found</Text>
        <Text style={styles.sub}>
          {cand.ownerName} — {cand.commitment}
        </Text>
        <View style={styles.diffCard} testID="update-diff">
          <View style={styles.diffRow}>
            <Text style={styles.diffLabel}>Previous expected date</Text>
            <Text style={styles.diffValue}>{fmtDate(cand.expectedAt)}</Text>
          </View>
          <View style={[styles.diffRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.diffLabel}>New expected date</Text>
            <Text style={[styles.diffValue, styles.diffNew]}>{newDate ? `${dayjs(newDate).format("ddd, D MMM YYYY")}${newText ? ` (${newText})` : ""}` : newText ?? "Unchanged"}</Text>
          </View>
        </View>
        <SourceBox text={sourceText} />
        <Button title="Update Await" onPress={applyUpdate} loading={busy === "update"} disabled={!newDate} testID="update-apply-button" style={{ marginTop: 8 }} />
        <Button title="Keep existing date" variant="outline" onPress={keepDate} loading={busy === "keep"} testID="update-keep-button" />
        <Button title="Create new Await" variant="ghost" onPress={createNew} testID="update-create-new-button" />
      </ScrollView>
    </View>
  );
}

function SourceBox({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sourceCard} testID="match-source">
      <Text style={styles.sourceLabel}>Shared content</Text>
      <Text style={styles.sourceText}>{text}</Text>
    </View>
  );
}

export function RemindLaterSheet({ visible, onClose, onPick, item }: { visible: boolean; onClose: () => void; onPick: (days: number) => void; item?: Pick<AwaitItem, "ownerName" | "expectedAt" | "nextCheckAt"> | null }) {
  return <SnoozeSheet visible={visible} onClose={onClose} item={item} onPick={(p) => onPick(p.days)} />;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  sub: { fontSize: 15, color: c.muted, textAlign: "center", marginBottom: 4 },
  muted: { color: c.muted, textAlign: "center", marginTop: 40 },
  confRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  confLabel: { color: c.muted, fontSize: 14 },
  explain: { color: c.muted, fontSize: 13, flexShrink: 1 },
  quoteCard: { backgroundColor: c.successTint, borderRadius: radius.lg, padding: spacing.lg },
  quote: { color: c.onSurface, fontSize: 15, lineHeight: 22, fontStyle: "italic" },
  neverAuto: { fontSize: 12.5, color: c.muted, textAlign: "center" },
  diffCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  diffRow: { paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider, gap: 2 },
  diffLabel: { fontSize: 12.5, color: c.muted },
  diffValue: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  diffNew: { color: c.brandPrimary },
  sourceCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 6, marginTop: 8 },
  sourceLabel: { fontSize: 12, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  sourceText: { fontSize: 14.5, color: c.onSurface, lineHeight: 21 },
}));
