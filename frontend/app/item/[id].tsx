import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import dayjs from "dayjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Banner, Icon, IconBox, Pill, ScreenHeader, StateSelector, Field } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { Ring } from "@/src/components/Ring";
import { SnoozeSheet, type SnoozePick } from "@/src/components/SnoozeSheet";
import { CATEGORY_TONE } from "@/src/components/AwaitCard";
import { useAwait, useAwaitAction, useEvents, useEvidence, useInvalidateAwaits } from "@/src/hooks";
import { api } from "@/src/api";
import { amountLabel, categoryIcon, dueLabel, fmtDate, fromNow, sourceLabel, stateLabel } from "@/src/format";
import { CATEGORY_LABEL, type AwaitItem, type Evidence } from "@/src/types";
import { useToast } from "@/src/components/Toast";
import { cancelReminder } from "@/src/notifications";
import { ErrorRetry } from "@/src/components/common";

type SheetKind = null | "remind" | "done" | "delete" | "reopen" | "addEvidence" | "editNotes" | "editAmount" | "menu";

const EVIDENCE_ICON: Record<string, string> = { SCREENSHOT: "image-outline", IMAGE: "image-outline", DOCUMENT: "document-text-outline", URL: "link-outline", VOICE: "mic-outline" };

function describe(item: AwaitItem, daysLate: number) {
  const who = item.ownerName;
  if (item.state === "DONE") return `Completed ${fromNow(item.completedAt)}.`;
  if (item.attentionState === "POSSIBLE_RESOLUTION") return `${who} may have completed this — confirm to close it.`;
  if (item.attentionState === "NEEDS_REVIEW") return `${item.ignoredReminderCount} reminders went unanswered. Decide what happens next.`;
  if (item.expectedAt && daysLate > 0) return `${who} is ${daysLate} ${daysLate === 1 ? "day" : "days"} past the promised date.`;
  if (item.expectedAt && daysLate === 0) return `Due today — ${who} promised it by ${dayjs(item.expectedAt).format("ddd, D MMM")}.`;
  if (item.expectedAt) return `${who} promised this by ${dayjs(item.expectedAt).format("ddd, D MMM")}.`;
  if (item.expectedText) return `Expected “${item.expectedText}” — no firm date yet.`;
  return "No expected date yet. Add one so Await can remind you.";
}

function reminderStatus(item: AwaitItem): { text: string; tone: "brand" | "warning" | "neutral" } {
  if (item.state === "DONE") return { text: "Off", tone: "neutral" };
  if (item.attentionState === "POSSIBLE_RESOLUTION" || item.attentionState === "NEEDS_REVIEW") return { text: "Paused", tone: "warning" };
  return { text: "Active", tone: "brand" };
}

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
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [viewEv, setViewEv] = useState<Evidence | null>(null);
  const [newEvidence, setNewEvidence] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const item = q.data;

  if (q.isLoading || !item) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader title="Await Details" />
        {q.isError ? <ErrorRetry onRetry={q.refetch} message="Couldn’t load this Await." /> : <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const due = dueLabel(item);
  const isDone = item.state === "DONE";
  const daysLate = item.expectedAt ? dayjs().startOf("day").diff(dayjs(item.expectedAt).startOf("day"), "day") : 0;
  const possible = item.attentionState === "POSSIBLE_RESOLUTION" && !isDone;
  const review = item.attentionState === "NEEDS_REVIEW" && !isDone;
  const reminders = reminderStatus(item);
  const evList = evidence.data ?? [];
  const resolutionEv = evList.find((e) => e.id === item.resolutionEvidenceId) ?? evList[evList.length - 1];
  const evs = [...(events.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const tone = CATEGORY_TONE[item.category] ?? "neutral";

  const ok = (msg: string) => () => { setSheet(null); toast.show(msg, "success"); };
  const setState = (s: "MY_TURN" | "THEIR_TURN" | "DONE") => {
    if (s === "DONE") return setSheet("done");
    if (isDone) return setSheet("reopen");
    action.mutate({ path: "/state", json: { state: s } }, { onSuccess: ok(`Now ${stateLabel(s)}`) });
  };
  const markDone = () => action.mutate({ path: "/state", json: { state: "DONE" } }, { onSuccess: ok("Marked as Done") });
  const reopen = (s: "MY_TURN" | "THEIR_TURN") => action.mutate({ path: "/reopen", json: { state: s } }, { onSuccess: ok("Reopened") });
  const snooze = (p: SnoozePick) => action.mutate({ path: "/snooze", json: { until: p.until, days: p.days } }, { onSuccess: ok(`Reminder set · ${dayjs(p.until).format("ddd, D MMM")}`) });
  const resolve = (a: "close" | "still_waiting" | "remind_later", days?: number) =>
    action.mutate({ path: "/resolution", json: { action: a, days } }, { onSuccess: ok(a === "close" ? "Marked as Done" : a === "still_waiting" ? "Kept open — reminders resumed" : "Reminder scheduled") });
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
  const saveAmount = async () => {
    const n = parseFloat(amount.replace(/[^0-9.]/g, ""));
    await api(`/awaits/${id}`, { method: "PATCH", json: { amount: Number.isFinite(n) && n > 0 ? n : 0, currency: item.currency ?? "INR" } });
    setSheet(null);
    invalidate(id);
  };
  const openMenu = (k: string) => {
    if (k === "notes") { setNotes(item.notes ?? ""); setSheet("editNotes"); }
    else if (k === "amount") { setAmount(item.amount ? String(item.amount) : ""); setSheet("editAmount"); }
    else if (k === "recurring") { setSheet(null); router.push({ pathname: "/template-edit", params: { who: item.ownerName, what: item.commitment, category: item.category, amount: item.amount ? String(item.amount) : "", currency: item.currency ?? "INR", state: item.state === "MY_TURN" ? "MY_TURN" : "THEIR_TURN", notes: item.notes ?? "" } }); }
    else if (k === "evidence") setSheet("addEvidence");
    else if (k === "delete") setSheet("delete");
  };

  const bannerText = possible
    ? "Reminders are paused until you confirm."
    : review
      ? "Reminders are paused — this needs your decision."
      : isDone
        ? `Closed ${fmtDate(item.completedAt)}.`
        : item.nextReminderAt
          ? `Next reminder ${dayjs(item.nextReminderAt).format("ddd, D MMM · h:mm A")}.`
          : `${item.reminderCount} ${item.reminderCount === 1 ? "reminder" : "reminders"} sent so far.`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="item-details-screen">
      <ScreenHeader
        title="Await Details"
        right={
          <Pressable testID="item-menu-button" onPress={() => setSheet("menu")} style={styles.iconBtn} hitSlop={8}>
            <Icon name="ellipsis-vertical" size={20} color={colors.onSurface} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {/* ------------------------------------------------------------ Hero */}
        <View style={styles.card} testID="item-hero">
          <View style={styles.heroRow}>
            <View style={styles.heroTile}>
              <IconBox letter={item.ownerName.charAt(0).toUpperCase()} tone={tone} size={64} />
              <View style={[styles.heroCatBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <Icon name={categoryIcon(item.category)} size={12} color={colors.onSurfaceTertiary} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} testID="item-title" numberOfLines={2}>{item.commitment}</Text>
              {amountLabel(item) ? <Text style={styles.amount} testID="item-amount">{amountLabel(item)}</Text> : null}
              <Pressable testID="item-owner-link" onPress={() => router.push(`/owner/${encodeURIComponent(item.ownerName)}`)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.owner} numberOfLines={1}>{item.ownerName}</Text>
                <Icon name="chevron-forward" size={13} color={colors.muted} />
              </Pressable>
            </View>
            <Pill text={due.text} tone={due.tone} testID="item-status-pill" />
          </View>
          <Text style={styles.heroDesc} testID="item-description">{describe(item, daysLate)}</Text>
          {item.pending ? <Banner icon="cloud-upload-outline" tone="warning" text="Saved offline — will sync when you’re back online." testID="item-pending-banner" /> : null}
          <View style={styles.divider} />
          <View style={styles.metaRow}>
            <Meta icon="person-outline" label="Owner" value={item.ownerName} />
            <Meta icon="pricetag-outline" label="Type" value={CATEGORY_LABEL[item.category].replace(/s$/, "")} />
            <Meta icon="calendar-outline" label="Expected" value={item.expectedAt ? dayjs(item.expectedAt).format("MMM D") : item.expectedText ? "TBD" : "—"} />
            <Meta icon="flash-outline" label="Alerts" value={reminders.text} accent={reminders.tone === "brand" ? colors.brandPrimary : reminders.tone === "warning" ? colors.warning : colors.muted} last />
          </View>
        </View>

        {/* ------------------------------------------------------------ Resolution signal */}
        {possible ? (
          <View style={styles.card} testID="item-resolution-card">
            <View style={styles.signalRow}>
              <IconBox name="sparkles-outline" tone="brand" size={52} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.signalTitle}>Resolution signal detected</Text>
                <Text style={styles.signalSub}>Something you shared suggests {item.ownerName} completed this.</Text>
                {resolutionEv ? (
                  <Text style={styles.signalMeta}>{sourceLabel(resolutionEv.type)} · {dayjs(resolutionEv.createdAt).format("MMM D, h:mm A")}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Ring value={item.resolutionConfidence ?? 0.85} size={64} testID="item-confidence-ring" />
                <Text style={styles.ringLabel}>Confidence</Text>
              </View>
            </View>
            {resolutionEv?.contentText ? (
              <Pressable onPress={() => setViewEv(resolutionEv)} style={styles.quote} testID="item-resolution-quote">
                <Text style={styles.quoteText} numberOfLines={4}>“{resolutionEv.contentText.trim()}”</Text>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
            <View style={styles.grid}>
              <GridBtn testID="item-resolution-close" icon="checkmark" label="Yes, close it" primary onPress={() => resolve("close")} />
              <GridBtn testID="item-resolution-wait" icon="hourglass-outline" label="Still waiting" onPress={() => resolve("still_waiting")} />
            </View>
            <View style={styles.grid}>
              <GridBtn testID="item-resolution-evidence" icon="document-text-outline" label="View evidence" onPress={() => resolutionEv && setViewEv(resolutionEv)} />
              <GridBtn testID="item-remind-button" icon="time-outline" label="Remind later" onPress={() => setSheet("remind")} />
            </View>
          </View>
        ) : null}

        {/* ------------------------------------------------------------ Needs review */}
        {review ? (
          <View style={styles.card} testID="item-review-card">
            <View style={styles.signalRow}>
              <IconBox name="eye-outline" tone="purple" size={52} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.signalTitle}>Needs your review</Text>
                <Text style={styles.signalSub}>{item.ignoredReminderCount} reminders went unanswered. Await stopped nudging so it doesn’t become noise.</Text>
              </View>
            </View>
            <View style={styles.grid}>
              <GridBtn testID="item-followup-button" icon="chatbubble-ellipses-outline" label="Follow Up" primary onPress={() => router.push(`/followup/${id}`)} />
              <GridBtn testID="item-review-wait" icon="hourglass-outline" label="Still waiting" onPress={() => snooze({ until: dayjs().add(3, "day").hour(9).minute(0).toISOString(), days: 3, label: "3 days" })} />
            </View>
            <View style={styles.grid}>
              <GridBtn testID="item-done-button" icon="checkmark-circle-outline" label="Mark as Done" onPress={() => setSheet("done")} />
              <GridBtn testID="item-remind-button" icon="time-outline" label="Remind later" onPress={() => setSheet("remind")} />
            </View>
          </View>
        ) : null}

        {/* ------------------------------------------------------------ Quick actions */}
        {!possible && !review ? (
          <View style={styles.actionsCard} testID="item-actions">
            {isDone ? (
              <View style={styles.grid}>
                <GridBtn testID="item-reopen-button" icon="refresh-outline" label="Reopen" primary onPress={() => setSheet("reopen")} />
                <GridBtn testID="add-evidence-button" icon="attach-outline" label="Add evidence" onPress={() => setSheet("addEvidence")} />
              </View>
            ) : (
              <>
                <View style={styles.grid}>
                  <GridBtn testID="item-followup-button" icon="chatbubble-ellipses-outline" label="Follow Up" primary onPress={() => router.push(`/followup/${id}`)} />
                  <GridBtn testID="item-remind-button" icon="time-outline" label="Remind later" onPress={() => setSheet("remind")} />
                </View>
                <View style={styles.grid}>
                  <GridBtn testID="item-done-button" icon="checkmark-circle-outline" label="Mark as Done" onPress={() => setSheet("done")} />
                  <GridBtn testID="add-evidence-button" icon="attach-outline" label="Add evidence" onPress={() => setSheet("addEvidence")} />
                </View>
              </>
            )}
          </View>
        ) : null}

        {/* ------------------------------------------------------------ Status */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Status</Text>
            <Text style={styles.cardMeta}>{isDone ? "Completed" : item.state === "MY_TURN" ? "You own the next step" : `${item.ownerName} owes you`}</Text>
          </View>
          <StateSelector value={item.state} onChange={setState} testID="item-state" />
        </View>

        {/* ------------------------------------------------------------ Timeline */}
        <View style={styles.card} testID="item-timeline">
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Timeline</Text>
            <Text style={styles.cardMeta}>{evs.length ? `${isDone ? evs.length : Math.max(evs.length - 1, 0)} of ${evs.length} complete` : ""}</Text>
          </View>
          {events.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          {evs.map((e, i) => {
            const last = i === evs.length - 1;
            const current = last && !isDone;
            return (
              <View key={e.id} style={styles.step}>
                <View style={styles.stepRail}>
                  <View style={[styles.stepDot, current ? styles.stepDotCurrent : styles.stepDotDone]}>
                    {current ? <View style={styles.stepInner} /> : <Icon name="checkmark" size={14} color={colors.onBrandPrimary} />}
                  </View>
                  {!last ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={[styles.stepBody, !last && { paddingBottom: 18 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{e.text}</Text>
                    <Text style={styles.stepDate}>{dayjs(e.createdAt).format("MMM D, YYYY, h:mm A")}</Text>
                  </View>
                  <Text style={styles.stepRight}>{fromNow(e.createdAt)}</Text>
                </View>
              </View>
            );
          })}
          <Banner icon="information-circle-outline" tone={possible || review ? "warning" : "brand"} text={bannerText} testID="item-timeline-banner" />
        </View>

        {/* ------------------------------------------------------------ Evidence */}
        <View style={styles.card} testID="item-evidence">
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Evidence</Text>
            <Pressable testID="item-evidence-add" onPress={() => setSheet("addEvidence")} hitSlop={8}>
              <Text style={styles.link}>Add</Text>
            </Pressable>
          </View>
          {evidence.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          {evList.length === 0 && !evidence.isLoading ? <Text style={styles.empty}>Only content you explicitly share appears here.</Text> : null}
          {evList.map((ev, i) => (
            <Pressable key={ev.id} testID={`evidence-${ev.id}`} onPress={() => setViewEv(ev)} style={[styles.evRow, i < evList.length - 1 && styles.evDivider]}>
              <IconBox name={EVIDENCE_ICON[ev.type] ?? "chatbubble-outline"} size={40} tone="neutral" />
              <View style={{ flex: 1 }}>
                <Text style={styles.evTitle} numberOfLines={1}>{ev.fileName ?? sourceLabel(ev.type)}</Text>
                <Text style={styles.evSub} numberOfLines={2}>{ev.contentText ?? ev.uri ?? ""}</Text>
              </View>
              <Text style={styles.stepRight}>{dayjs(ev.createdAt).format("D MMM")}</Text>
            </Pressable>
          ))}
        </View>

        {/* ------------------------------------------------------------ Notes & details */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Notes</Text>
            <Pressable testID="item-edit-notes" onPress={() => { setNotes(item.notes ?? ""); setSheet("editNotes"); }} hitSlop={8}>
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          </View>
          <Text style={[styles.notes, !item.notes && { color: colors.muted }]} testID="item-notes">{item.notes || "No notes yet."}</Text>
          <View style={styles.divider} />
          <DetailRow label="Expected by" value={fmtDate(item.expectedAt)} />
          {item.expectedText ? <DetailRow label="As shared" value={`“${item.expectedText}”`} /> : null}
          <DetailRow label="Source" value={`${sourceLabel(item.sourceType)}${item.sourceAppLabel ? ` · ${item.sourceAppLabel}` : ""}`} />
          {item.nextCheckAt && !isDone ? <DetailRow label="Next check-in" value={fmtDate(item.nextCheckAt)} /> : null}
          <DetailRow label="Created" value={fmtDate(item.createdAt)} last />
        </View>
      </ScrollView>

      <SnoozeSheet visible={sheet === "remind"} onClose={() => setSheet(null)} item={item} onPick={(p) => (possible ? resolve("remind_later", p.days) : snooze(p))} />
      <Sheet visible={sheet === "menu"} onClose={() => setSheet(null)} title="Await options" testID="item-menu-sheet"
        options={[
          { key: "notes", label: "Edit notes", icon: "create-outline" },
          { key: "amount", label: item.amount ? "Edit amount" : "Add amount", subtitle: "Money involved, counts toward totals owed", icon: "cash-outline" },
          { key: "evidence", label: "Add evidence", icon: "attach-outline" },
          { key: "recurring", label: "Make it recurring", subtitle: "Recreate this Await weekly, monthly or yearly", icon: "repeat-outline" },
          { key: "delete", label: "Delete Await", subtitle: "Removes notes and evidence too", icon: "trash-outline" },
        ]}
        onSelect={openMenu}
      />
      <Sheet visible={sheet === "done"} onClose={() => setSheet(null)} icon="checkmark-circle-outline" tone="success" title="Mark as Done" subtitle="Move this item to completed." primary={{ title: "Mark as Done", variant: "success", onPress: markDone, loading: action.isPending }} secondary={{ title: "Cancel", onPress: () => setSheet(null) }} testID="done-sheet" />
      <Sheet visible={sheet === "delete"} onClose={() => setSheet(null)} icon="trash-outline" tone="error" title="Delete this Await?" subtitle={"This removes the Await, its notes, and its saved evidence.\nThis action cannot be undone."} primary={{ title: "Delete Await", variant: "danger", onPress: del }} secondary={{ title: "Cancel", onPress: () => setSheet(null) }} testID="delete-sheet" />
      <Sheet visible={sheet === "reopen"} onClose={() => setSheet(null)} icon="refresh-outline" title="Reopen Item" subtitle="Who has the next action?" testID="reopen-sheet" options={[{ key: "MY_TURN", label: "My Turn", subtitle: "I own the next step", icon: "person-outline" }, { key: "THEIR_TURN", label: "Their Turn", subtitle: "Someone else owes me", icon: "people-outline" }]} onSelect={(k) => reopen(k as any)} />
      <Sheet visible={sheet === "addEvidence"} onClose={() => setSheet(null)} icon="attach-outline" title="Add Evidence" subtitle="Paste text you received about this Await." primary={{ title: "Save evidence", onPress: addEvidence }} testID="add-evidence-sheet">
        <View style={{ marginTop: 12 }}>
          <Field placeholder="Paste the message, note or link…" value={newEvidence} onChangeText={setNewEvidence} multiline testID="add-evidence-input" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "editAmount"} onClose={() => setSheet(null)} icon="cash-outline" title="Amount" subtitle={`In ${item.currency ?? "INR"}. Leave empty to remove.`} primary={{ title: "Save", onPress: saveAmount }} testID="edit-amount-sheet">
        <View style={{ marginTop: 12 }}>
          <Field placeholder="e.g. 3499" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" testID="edit-amount-input" />
        </View>
      </Sheet>
      <Sheet visible={sheet === "editNotes"} onClose={() => setSheet(null)} icon="create-outline" title="Notes" primary={{ title: "Save", onPress: saveNotes }} testID="edit-notes-sheet">
        <View style={{ marginTop: 12 }}>
          <Field placeholder="Add notes…" value={notes} onChangeText={setNotes} multiline testID="edit-notes-input" />
        </View>
      </Sheet>
      <Sheet visible={!!viewEv} onClose={() => setViewEv(null)} title={viewEv?.fileName ?? sourceLabel(viewEv?.type ?? "SHARED_TEXT")} subtitle={viewEv ? dayjs(viewEv.createdAt).format("D MMM YYYY · h:mm A") : undefined} primary={{ title: "Delete evidence", variant: "danger", onPress: () => viewEv && deleteEvidence(viewEv.id) }} secondary={{ title: "Close", onPress: () => setViewEv(null) }} testID="view-evidence-sheet">
        {viewEv?.uri && (viewEv.type === "SCREENSHOT" || viewEv.type === "IMAGE") ? <Image source={{ uri: viewEv.uri }} style={styles.evImage} contentFit="contain" /> : null}
        {viewEv?.contentText ? <Text style={[styles.notes, { marginTop: 12 }]} testID="view-evidence-text">{viewEv.contentText}</Text> : null}
      </Sheet>
    </View>
  );
}

function Meta({ icon, label, value, accent, last }: { icon: string; label: string; value: string; accent?: string; last?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.meta, !last && styles.metaDivider]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon name={icon} size={13} color={accent ?? colors.muted} />
        <Text style={styles.metaLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.metaValue, accent ? { color: accent } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function GridBtn({ icon, label, onPress, primary, testID }: { icon: string; label: string; onPress: () => void; primary?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.gridBtn, primary && styles.gridBtnPrimary, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={18} color={primary ? colors.onBrandPrimary : colors.brandPrimary} />
      <Text style={[styles.gridText, primary && { color: colors.onBrandPrimary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.lg, gap: 12, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 12 },
  actionsCard: { gap: 10 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroTile: { position: "relative" },
  heroCatBadge: { position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  title: { fontSize: 19, fontWeight: "800", color: c.onSurface, letterSpacing: -0.2, lineHeight: 24 },
  owner: { fontSize: 15, fontWeight: "600", color: c.onSurfaceTertiary },
  amount: { fontSize: 22, fontWeight: "800", color: c.onSurface, letterSpacing: -0.3 },
  heroDesc: { fontSize: 14.5, lineHeight: 21, color: c.onSurfaceSecondary },
  divider: { height: 1, backgroundColor: c.divider },
  metaRow: { flexDirection: "row" },
  meta: { flex: 1, gap: 3, paddingRight: 6, minWidth: 0 },
  metaDivider: { borderRightWidth: 1, borderRightColor: c.divider, marginRight: 8 },
  metaLabel: { fontSize: 11.5, color: c.muted, flexShrink: 1 },
  metaValue: { fontSize: 13.5, fontWeight: "700", color: c.onSurface },
  signalRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  signalTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface },
  signalSub: { fontSize: 13.5, lineHeight: 19, color: c.onSurfaceSecondary },
  signalMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
  ringLabel: { fontSize: 11.5, color: c.muted },
  quote: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 14 },
  quoteText: { flex: 1, fontSize: 14, lineHeight: 20, color: c.onSurfaceSecondary, fontStyle: "italic" },
  grid: { flexDirection: "row", gap: 10 },
  gridBtn: { flex: 1, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 8 },
  gridBtnPrimary: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  gridText: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16.5, fontWeight: "800", color: c.onSurface },
  cardMeta: { fontSize: 12.5, color: c.muted },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: 13.5 },
  step: { flexDirection: "row", gap: 12 },
  stepRail: { alignItems: "center", width: 28 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepDotDone: { backgroundColor: c.brandPrimary },
  stepDotCurrent: { borderWidth: 2, borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  stepInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brandPrimary },
  stepLine: { flex: 1, width: 2, backgroundColor: c.brandPrimary, opacity: 0.45, marginVertical: 2 },
  stepBody: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepTitle: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  stepDate: { fontSize: 12.5, color: c.muted, marginTop: 2 },
  stepRight: { fontSize: 12, color: c.muted, paddingTop: 2 },
  empty: { color: c.muted, fontSize: 13.5 },
  evRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  evDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  evTitle: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  evSub: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 2 },
  evImage: { width: "100%", height: 260, borderRadius: radius.md, marginTop: 12, backgroundColor: c.surfaceTertiary },
  notes: { fontSize: 14.5, color: c.onSurface, lineHeight: 21 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  rowLabel: { fontSize: 13.5, color: c.muted, width: 110 },
  rowValue: { flex: 1, fontSize: 14, fontWeight: "600", color: c.onSurface, textAlign: "right" },
}));
