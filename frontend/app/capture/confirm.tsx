import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, radius, spacing } from "@/src/theme";
import { Button, IconBox, ScreenHeader, Pill } from "@/src/components/ui";
import { AwaitForm, amountPayload, emptyForm, type AwaitFormValue } from "@/src/components/AwaitForm";
import { captureStore, itemsToEvidence } from "@/src/capture-store";
import { analyzeCurrent } from "@/src/analyze";
import { api } from "@/src/api";
import { useInvalidateAwaits } from "@/src/hooks";
import { useToast } from "@/src/components/Toast";
import { syncToDeviceCalendar } from "@/src/calendar";
import { usePrefs } from "@/src/prefs";
import { FreeLimitSheet, useFreeLimit } from "@/src/components/common";
import { sourceLabel } from "@/src/format";
import { scheduleReminder } from "@/src/notifications";
import { parseExpectedPhrase } from "@/src/dates";

export default function Confirm() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { prefs } = usePrefs();
  const invalidate = useInvalidateAwaits();
  const limit = useFreeLimit();
  const payload = captureStore.get();
  const ex = payload?.extraction;
  const [form, setForm] = useState<AwaitFormValue>(() =>
    ex
      ? { who: ex.who ?? "", what: ex.what ?? "", expectedAt: ex.expected_at ? new Date(ex.expected_at).toISOString() : (parseExpectedPhrase(ex.expected_text)?.toISOString() ?? null), expectedText: ex.expected_text ?? "", category: ex.category ?? "OTHER", state: ex.suggested_state ?? "THEIR_TURN", notes: "", amount: ex.amount ? String(ex.amount) : "", currency: ex.currency ?? "INR", reminderLeadDays: 0, reminderTime: null }
      : emptyForm(),
  );
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const failed = !payload || payload.failed || !ex;
  const items = payload?.items ?? [];
  const first = items[0];

  const save = async () => {
    if (!form.who.trim() || !form.what.trim()) return toast.show("Who and What are required", "error");
    setSaving(true);
    try {
      const created = await api("/awaits", {
        method: "POST",
        json: {
          ownerName: form.who,
          commitment: form.what,
          expectedAt: form.expectedAt,
          expectedText: form.expectedText || null,
          state: form.state,
          category: form.category,
          notes: form.notes,
          ...amountPayload(form),
          sourceType: payload?.sourceType ?? "MANUAL",
          sourceAppLabel: first?.appLabel ?? null,
          evidence: itemsToEvidence(items),
        },
      });
      invalidate();
      scheduleReminder(created);
      if (prefs.calendarSync) syncToDeviceCalendar(created, { requestIfNeeded: true }).catch(() => {});
      captureStore.clear();
      toast.show("Saved to Await", "success");
      router.dismissAll?.();
      router.replace(`/item/${created.id}`);
    } catch (e: any) {
      if (!limit.handle(e)) toast.show(e?.message ?? "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await analyzeCurrent();
    } catch (e: any) {
      toast.show(e?.message ?? "Still couldn’t extract", "error");
    } finally {
      setRetrying(false);
    }
  };

  const Source = () =>
    first ? (
      <View style={styles.sourceCard} testID="confirm-source">
        {first.kind === "image" && first.uri ? (
          <Image source={{ uri: first.uri }} style={styles.sourceImage} contentFit="cover" />
        ) : first.kind === "document" ? (
          <View style={styles.sourceRow}>
            <IconBox name="document-text-outline" size={36} />
            <Text style={styles.sourceText} numberOfLines={1}>{first.fileName}</Text>
          </View>
        ) : (
          <Text style={styles.sourceText} numberOfLines={6}>{first.text}</Text>
        )}
        <View style={styles.sourceMeta}>
          <Pill text={sourceLabel(payload?.sourceType ?? "MANUAL")} tone="brand" />
          {items.length > 1 ? <Pill text={`+${items.length - 1} more`} tone="neutral" /> : null}
          {first.appLabel ? <Text style={styles.sourceApp}>{first.appLabel}</Text> : null}
        </View>
      </View>
    ) : null;

  if (failed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="extract-failed-screen">
        <ScreenHeader title="AI Extract" />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={{ alignItems: "center", marginTop: 12 }}>
            <IconBox name="alert-circle-outline" tone="error" size={80} />
          </View>
          <Text style={styles.failTitle}>We couldn’t extract the details</Text>
          <Text style={styles.failSub}>We couldn’t confidently identify the who, what, and expected date from this content.</Text>
          <Text style={styles.nothingSaved} testID="nothing-saved-label">Nothing has been saved.</Text>
          <Source />
          <Button title="Try Again" onPress={retry} loading={retrying} testID="extract-retry-button" style={{ marginTop: 8 }} />
          <Button title="Enter Manually" variant="outline" onPress={() => router.replace("/capture/manual")} testID="extract-manual-button" />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="extract-confirm-screen">
      <ScreenHeader title="AI Extract & Confirm" />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <Source />
        <View style={{ gap: 4, marginTop: 4 }}>
          <Text style={styles.found}>We found the details</Text>
          <Text style={styles.foundSub}>Please confirm or edit.{ex?.confidence ? `  ·  ${Math.round(ex.confidence * 100)}% confident` : ""}</Text>
        </View>
        <AwaitForm value={form} onChange={setForm} source={`${sourceLabel(payload?.sourceType ?? "MANUAL")}${first?.appLabel ? ` · ${first.appLabel}` : ""}`} />
        <Button title="Save to Await" onPress={save} loading={saving} testID="confirm-save-button" style={{ marginTop: 8 }} />
        <Pressable testID="confirm-discard-link" onPress={() => { captureStore.clear(); router.dismissAll?.(); router.replace("/(tabs)"); }} style={styles.discard}>
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
      </KeyboardAwareScrollView>
      <FreeLimitSheet visible={limit.visible} onClose={limit.close} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.xl, gap: 16 },
  sourceCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: 10 },
  sourceImage: { width: "100%", height: 180, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceText: { fontSize: 14.5, color: c.onSurface, lineHeight: 21 },
  sourceMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  sourceApp: { fontSize: 12.5, color: c.muted },
  found: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  foundSub: { fontSize: 14, color: c.muted },
  failTitle: { fontSize: 22, fontWeight: "800", color: c.onSurface, textAlign: "center", marginTop: 8 },
  failSub: { fontSize: 14.5, color: c.muted, textAlign: "center", lineHeight: 21 },
  nothingSaved: { fontSize: 14, color: c.onSurface, fontWeight: "700", textAlign: "center" },
  discard: { height: 44, alignItems: "center", justifyContent: "center" },
  discardText: { color: c.muted, fontWeight: "600" },
}));
