import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, spacing } from "@/src/theme";
import { Button, ScreenHeader } from "@/src/components/ui";
import { AwaitForm, amountPayload, emptyForm, type AwaitFormValue } from "@/src/components/AwaitForm";
import { api } from "@/src/api";
import { useInvalidateAwaits } from "@/src/hooks";
import { useToast } from "@/src/components/Toast";
import { FreeLimitSheet, useFreeLimit } from "@/src/components/common";
import { captureStore, itemsToEvidence } from "@/src/capture-store";
import { scheduleReminder } from "@/src/notifications";

export default function Manual() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAwaits();
  const limit = useFreeLimit();
  const pending = captureStore.get();
  const [form, setForm] = useState<AwaitFormValue>(() => ({ ...emptyForm(), notes: pending?.items?.[0]?.text?.slice(0, 500) ?? "" }));
  const [saving, setSaving] = useState(false);

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
          sourceType: pending?.sourceType ?? "MANUAL",
          sourceAppLabel: pending?.items?.[0]?.appLabel ?? null,
          evidence: pending ? itemsToEvidence(pending.items) : [],
        },
      });
      invalidate();
      scheduleReminder(created);
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="manual-add-screen">
      <ScreenHeader title="Add Manually" />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <Text style={styles.sub}>Enter the details yourself. Works without AI.</Text>
        <AwaitForm value={form} onChange={setForm} />
        <Button title="Save to Await" onPress={save} loading={saving} testID="manual-save-button" style={{ marginTop: 8 }} />
      </KeyboardAwareScrollView>
      <FreeLimitSheet visible={limit.visible} onClose={limit.close} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 16 },
  sub: { color: c.muted, fontSize: 14 },
}));
