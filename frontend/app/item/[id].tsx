import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import dayjs from "dayjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Icon, IconBox, Pill, ScreenHeader, StateSelector, Field } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { CATEGORY_TONE } from "@/src/components/AwaitCard";
import { RemindLaterSheet } from "@/app/capture/match";
import { useAwait, useAwaitAction, useEvents, useEvidence, useInvalidateAwaits } from "@/src/hooks";
import { api } from "@/src/api";
import { dueLabel, fmtDate, sourceLabel, stateLabel } from "@/src/format";
import { CATEGORY_LABEL } from "@/src/types";
import { useToast } from "@/src/components/Toast";
import { cancelReminder } from "@/src/notifications";
import { ErrorRetry } from "@/src/components/common";

type Tab = "details" | "updates" | "evidence";

const EVENT_ICON: Record<string, string> = {
  CREATED: "add-circle-outline",
  EXPECTED_CHANGED: "calendar-outline",
  REMINDER_SENT: "notifications-outline",
  REMINDER_SCHEDULED: "alarm-outline",
  FOLLOWUP_DRAFTED: "create-outline",
  FOLLOWUP_RECORDED: "paper-plane-outline",
  STATE_CHANGED: "swap-horizontal-outline",
  RESOLUTION_SIGNAL: "sparkles-outline",
  COMPLETED: "checkmark-circle-outline",
  REOPENED: "refresh-outline",
  NEEDS_REVIEW: "eye-outline",
  UPDATE_RECEIVED: "download-outline",
  EVIDENCE_ADDED: "attach-outline",
};

export default function ItemDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const invalidate = useInvalidateAwaits();
  const q = useAwait(id);
  const events = useEvents(id);
  const evidence = useEvidence(id);
  const action = useAwaitAction(id);
  const [tab, setTab] = useState<Tab>("details");
  const [sheet, setSheet] = useState<null | "remind" | "done" | "delete" | "reopen" | "evidence" | "addEvidence" | "editNotes">(null);
  const [viewEv, setViewEv] = useState<any>(null);
  const [newEvidence, setNewEvidence] = useState("");
  const [notes, setNotes] = useState("");
  const item = q.data;

  if (q.isLoading || !item) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader />
        {q.isError ? <ErrorRetry onRetry={q.refetch} message="Couldn’t load this Await." /> : <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const due = dueLabel(item);
  const isDone = item.state === "DONE";
  const daysLate = item.expectedAt ? dayjs().startOf("day").diff(dayjs(item.expectedAt).startOf("day"), "day") : 0;

  const setState = (s: "MY_TURN" | "THEIR_TURN" | "DONE") => {
    if (s === "DONE") return setSheet("done");
    if (isDone) return setSheet("reopen");
    action.mutate({ path: "/state", json: { state: s } }, { onSuccess: () => toast.show(`Now ${stateLabel(s)}`, "success") });
  };

  const markDone = () => action.mutate({ path: "/state", json: { state: "DONE" } }, { onSuccess: () => { setSheet(null); toast.show("Marked as Done", "success"); } });
  const reopen = (s: "MY_TURN" | "THEIR_TURN") => action.mutate({ path: "/reopen", json: { state: s } }, { onSuccess: () => { setSheet(null); toast.show("Reopened", "success"); } });
  const remind = (days: number) => action.mutate({ path: "/snooze", json: { days } }, { onSuccess: () => { setSheet(null); toast.show("Reminder scheduled", "success"); } });
  const del = async () => {
    await api(`/awaits/${id}`, { method: "DELETE" });
    cancelReminder(id);
    invalidate();
    setSheet(null);
    toast.show("Await deleted", "success");
    router.replace("/(tabs)");
  };
  const addEvidence = async () => {
    if (!newEvidence.trim()) return;
    await api(`/awaits/${id}/evidence`, { method: "POST", json: { type: "SHARED_TEXT", contentText: newEvidence.trim(), mimeType: "text/plain" } });
    setNewEvidence("");
    setSheet(null);
    invalidate(id);
  };
  const deleteEvidence = async (eid: string) => {
    await api(`/evidence/${eid}`, { method: "DELETE" });
    setViewEv(null);
    invalidate(id);
  };
  const saveNotes = async () => {
    await api(`/awaits/${id}`, { method: "PATCH", json: { notes } });
    setSheet(null);
    invalidate(id);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="item-details-screen">
      <ScreenHeader
        right={
          <Pressable testID="item-delete-button" onPress={() => setSheet("delete")} style={styles.iconBtn} hitSlop={8}>
            <Icon name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <View style={styles.titleRow}>
          <IconBox letter={item.ownerName.charAt(0).toUpperCase()} tone={CATEGORY_TONE[item.category]} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} testID="item-title">{item.commitment}</Text>
            <Text style={styles.owner}>{item.ownerName}</Text>
          </View>
          <Pill text={due.text} tone={due.tone} testID="item-status-pill" />
        </View>

        <View style={styles.tabs} testID="item-tabs">
          {(["details", "updates", "evidence"] as Tab[]).map((t) => (
            <Pressable key={t} testID={`item-tab-${t}`} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabSel]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextSel]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "details" ? (
          <View style={{ gap: 12 }}>
            <View style={styles.card}>
              <Row label="Expected by" value={fmtDate(item.expectedAt)} right={!isDone && daysLate > 0 ? <Pill text={`${daysLate} ${daysLate === 1 ? "day" : "days"} late`} tone="error" /> : undefined} />
              {item.expectedText ? <Row label="As shared" value={`“${item.expectedText}”`} /> : null}
              <Row label="Category" value={CATEGORY_LABEL[item.category]} />
              <Row label="Source" value={`${sourceLabel(item.sourceType)}${item.sourceAppLabel ? ` · ${item.sourceAppLabel}` : ""}`} />
              {isDone && item.completedAt ? <Row label="Completed" value={fmtDate(item.completedAt, true)} /> : null}
              {item.nextReminderAt && !isDone ? <Row label="Next reminder" value={fmtDate(item.nextReminderAt)} /> : null}
              {item.nextCheckAt && !isDone ? <Row label="Next check-in" value={fmtDate(item.nextCheckAt)} /> : null}
              {item.attentionState === "NEEDS_REVIEW" ? <Row label="Attention" value={`Needs review · ${item.ignoredReminderCount} reminders ignored`} last /> : <Row label="Reminders" value={`${item.reminderCount} sent`} last />}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Status</Text>
              <StateSelector value={item.state} onChange={setState} testID="item-state" />
            </View>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.label}>Notes</Text>
                <Pressable testID="item-edit-notes" onPress={() => { setNotes(item.notes ?? ""); setSheet("editNotes"); }}>
                  <Text style={styles.link}>Edit</Text>
                </Pressable>
              </View>
              <View style={styles.card}>
                <Text style={[styles.notes, !item.notes && { color: colors.muted }]} testID="item-notes">{item.notes || "No notes yet."}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {tab === "updates" ? (
          <View style={styles.card} testID="item-timeline">
            {events.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
            {(events.data ?? []).map((e, i, arr) => (
              <View key={e.id} style={styles.evt}>
                <View style={styles.evtLine}>
                  <IconBox name={EVENT_ICON[e.type] ?? "ellipse-outline"} size={32} tone={e.type === "COMPLETED" ? "success" : e.type === "NEEDS_REVIEW" ? "purple" : e.type === "RESOLUTION_SIGNAL" ? "success" : "brand"} />
                  {i < arr.length - 1 ? <View style={styles.evtConnector} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                  <Text style={styles.evtDate}>{dayjs(e.createdAt).format("D MMM YYYY · h:mm A")}</Text>
                  <Text style={styles.evtText}>{e.text}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "evidence" ? (
          <View style={{ gap: 10 }} testID="item-evidence">
            {evidence.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
            {(evidence.data ?? []).length === 0 && !evidence.isLoading ? (
              <View style={styles.card}>
                <Text style={{ color: colors.muted, textAlign: "center" }}>No evidence yet. Only content you explicitly share appears here.</Text>
              </View>
            ) : null}
            {(evidence.data ?? []).map((ev) => (
              <Pressable key={ev.id} testID={`evidence-${ev.id}`} onPress={() => setViewEv(ev)} style={styles.evCard}>
                <IconBox name={ev.type === "SCREENSHOT" || ev.type === "IMAGE" ? "image-outline" : ev.type === "DOCUMENT" ? "document-text-outline" : ev.type === "URL" ? "link-outline" : ev.type === "VOICE" ? "mic-outline" : "chatbubble-outline"} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.evTitle} numberOfLines={1}>{ev.fileName ?? sourceLabel(ev.type)}</Text>
                  <Text style={styles.evSub} numberOfLines={2}>{ev.contentText ?? ev.uri ?? ""}</Text>
                  <Text style={styles.evDate}>{dayjs(ev.createdAt).format("D MMM YYYY")}</Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
            <Button title="Add Evidence" icon="add" variant="outline" onPress={() => setSheet("addEvidence")} testID="add-evidence-button" />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]} testID="item-actions">
        {isDone ? (
          <Button title="Reopen" icon="refresh-outline" onPress={() => setSheet("reopen")} testID="item-reopen-button" />
        ) : (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <ActionBtn testID="item-remind-button" icon="alarm-outline" label="Remind Tomorrow" onPress={() => setSheet("remind")} />
            <ActionBtn testID="item-followup-button" icon="chatbubble-ellipses-outline" label="Follow Up" onPress={() => router.push(`/followup/${id}`)} />
            <ActionBtn testID="item-done-button" icon="checkmark-circle-outline" label="Mark as Done" primary onPress={() => setSheet("done")} />
          </View>
        )}
      </View>

      <RemindLaterSheet visible={sheet === "remind"} onClose={() => setSheet(null)} onPick={remind} />
      <Sheet visible={sheet === "done"} onClose={() => setSheet(null)} icon="checkmark-circle-outline" tone="success" title="Mark as Done" subtitle="Move this item to completed." primary={{ title: "Mark as Done", variant: "success", onPress: markDone, loading: action.isPending }} secondary={{ title: "Cancel", onPress: () => setSheet(null) }} testID="done-sheet" />
      <Sheet visible={sheet === "delete"} onClose={() => setSheet(null)} icon="trash-outline" tone="error" title="Delete this Await?" subtitle={"This removes the Await, its notes, and its saved evidence.\nThis action cannot be undone."} primary={{ title: "Delete Await", variant: "danger", onPress: del }} secondary={{ title: "Cancel", onPress: () => setSheet(null) }} testID="delete-sheet" />
      <Sheet visible={sheet === "reopen"} onClose={() => setSheet(null)} icon="refresh-outline" title="Reopen Item" subtitle="Who has the next action?" testID="reopen-sheet" options={[{ key: "MY_TURN", label: "My Turn", subtitle: "I own the next step", icon: "person-outline" }, { key: "THEIR_TURN", label: "Their Turn", subtitle: "Someone else owes me", icon: "people-outline" }]} onSelect={(k) => reopen(k as any)} />
      <Sheet visible={sheet === "addEvidence"} onClose={() => setSheet(null)} icon="attach-outline" title="Add Evidence" subtitle="Paste text you received about this Await." primary={{ title: "Save evidence", onPress: addEvidence }} testID="add-evidence-sheet">
        <View style={{ marginTop: 12 }}>
          <Field placeholder="Paste the message, note or link…" value={newEvidence} onChangeText={setNewEvidence} multiline testID="add-evidence-input" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "editNotes"} onClose={() => setSheet(null)} icon="create-outline" title="Notes" primary={{ title: "Save", onPress: saveNotes }} testID="edit-notes-sheet">
        <View style={{ marginTop: 12 }}>
          <Field placeholder="Add notes…" value={notes} onChangeText={setNotes} multiline testID="edit-notes-input" />
        </View>
      </Sheet>
      <Sheet visible={!!viewEv} onClose={() => setViewEv(null)} title={viewEv?.fileName ?? sourceLabel(viewEv?.type ?? "SHARED_TEXT")} subtitle={viewEv ? dayjs(viewEv.createdAt).format("D MMM YYYY · h:mm A") : undefined} primary={{ title: "Delete evidence", variant: "danger", onPress: () => deleteEvidence(viewEv.id) }} secondary={{ title: "Close", onPress: () => setViewEv(null) }} testID="view-evidence-sheet">
        {viewEv?.uri && (viewEv.type === "SCREENSHOT" || viewEv.type === "IMAGE") ? <Image source={{ uri: viewEv.uri }} style={styles.evImage} contentFit="contain" /> : null}
        {viewEv?.contentText ? <Text style={[styles.notes, { marginTop: 12 }]} testID="view-evidence-text">{viewEv.contentText}</Text> : null}
      </Sheet>
    </View>
  );
}

function Row({ label, value, right, last }: { label: string; value: string; right?: React.ReactNode; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: "flex-end", gap: 4 }}>
        <Text style={styles.rowValue}>{value}</Text>
        {right}
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, onPress, primary, testID }: { icon: string; label: string; onPress: () => void; primary?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={20} color={primary ? colors.onBrandPrimary : colors.brandPrimary} />
      <Text style={[styles.actionText, primary && { color: colors.onBrandPrimary }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 14 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  owner: { fontSize: 14, color: c.muted, marginTop: 2 },
  tabs: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  tab: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabSel: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  tabText: { fontSize: 13.5, fontWeight: "600", color: c.muted },
  tabTextSel: { color: c.onSurface },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10, gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  rowLabel: { fontSize: 13.5, color: c.muted, width: 110 },
  rowValue: { fontSize: 14.5, fontWeight: "600", color: c.onSurface, textAlign: "right" },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },
  notes: { fontSize: 14.5, color: c.onSurface, lineHeight: 21 },
  evt: { flexDirection: "row", gap: 12 },
  evtLine: { alignItems: "center" },
  evtConnector: { flex: 1, width: 2, backgroundColor: c.divider, marginVertical: 4 },
  evtDate: { fontSize: 12, color: c.muted },
  evtText: { fontSize: 14.5, color: c.onSurface, fontWeight: "600", marginTop: 2 },
  evCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 12 },
  evTitle: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  evSub: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 2 },
  evDate: { fontSize: 12, color: c.muted, marginTop: 4 },
  evImage: { width: "100%", height: 260, borderRadius: radius.md, marginTop: 12, backgroundColor: c.surfaceTertiary },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider },
  action: { flex: 1, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
  actionPrimary: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  actionText: { fontSize: 11.5, fontWeight: "700", color: c.onSurface, textAlign: "center", lineHeight: 14 },
}));
