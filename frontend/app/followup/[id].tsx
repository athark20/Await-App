import React, { useEffect, useState } from "react";
import { Linking, Platform, Share, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Chips, IconBox, ScreenHeader } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { useQuery } from "@tanstack/react-query";
import { useAwait, useAwaitAction, useInvalidateAwaits } from "@/src/hooks";
import type { AwaitItem } from "@/src/types";
import { amountLabel } from "@/src/format";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";
import { FreeLimitAi } from "@/app/capture/share";
import dayjs from "dayjs";

type Tone = "Polite" | "Firm" | "Casual" | "Professional";

export const OWNER_PREFIX = "owner__";

export default function FollowUp() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  // Owner mode: /followup/owner__<name> drafts ONE message covering everything that owner still owes.
  const ownerName = rawId?.startsWith(OWNER_PREFIX) ? decodeURIComponent(rawId.slice(OWNER_PREFIX.length)) : null;
  const id = ownerName ? "" : rawId;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { user } = useAuth();
  const q = useAwait(id);
  const action = useAwaitAction(id);
  const invalidate = useInvalidateAwaits();
  const ownerQ = useQuery({ queryKey: ["owners", ownerName], queryFn: () => api<{ ownerName: string; open: AwaitItem[] }>(`/owners/${encodeURIComponent(ownerName!)}`), enabled: !!ownerName });
  const ownerItems = ownerQ.data?.open ?? [];
  const [tone, setTone] = useState<Tone>("Polite");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiLimit, setAiLimit] = useState(false);
  const [sentSheet, setSentSheet] = useState(false);
  const item = ownerName ? (ownerItems[0] ?? null) : q.data;

  const fallback = () =>
    ownerName && ownerItems.length
      ? `Hi ${ownerName},\n\nI’m following up on a few things that are still pending:\n${ownerItems.map((it) => `• ${it.commitment}${amountLabel(it) ? ` (${amountLabel(it)})` : ""}${it.expectedAt ? ` — expected ${dayjs(it.expectedAt).format("MMM D")}` : ""}`).join("\n")}\n\nCould you please confirm the status of each, or share a new date?\n\nThanks,\n${user?.name ?? ""}`
      : item
      ? `Hi ${item.ownerName},\n\nI’m following up on ${item.commitment.charAt(0).toLowerCase() + item.commitment.slice(1)}. It was expected by ${item.expectedAt ? dayjs(item.expectedAt).format("MMM D, YYYY") : "the agreed date"}. Could you please confirm the status?\n\nThanks,\n${user?.name ?? ""}`
      : "";

  const generate = async (t: Tone) => {
    setBusy(true);
    try {
      const r = await api<{ draft: string }>(ownerName ? `/owners/${encodeURIComponent(ownerName)}/followup-draft` : `/awaits/${id}/followup-draft`, { method: "POST", json: { tone: t } });
      setDraft(r.draft);
    } catch (e: any) {
      if (e?.status === 402) {
        setAiLimit(true);
        setDraft(fallback());
      } else {
        setDraft(fallback());
        toast.show("Using a standard draft — AI unavailable", "info");
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (item && !draft) generate("Polite");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, ownerItems.length]);

  const copy = async () => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(draft);
    } else {
      await Share.share({ message: draft });
    }
    toast.show("Copied to clipboard", "success");
  };

  const openApp = async () => {
    const subject = encodeURIComponent(`Follow-up: ${item?.commitment ?? ""}`);
    const body = encodeURIComponent(draft);
    const wa = `whatsapp://send?text=${body}`;
    const mail = `mailto:?subject=${subject}&body=${body}`;
    const url = item?.sourceAppLabel?.toLowerCase().includes("whatsapp") ? wa : mail;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else await Share.share({ message: draft });
    } catch {
      await Share.share({ message: draft });
    }
  };

  const recordSent = (days: number) => {
    if (ownerName) {
      api(`/owners/${encodeURIComponent(ownerName)}/followup-sent`, { method: "POST", json: { checkDays: days, text: draft } })
        .then(() => {
          invalidate();
          setSentSheet(false);
          toast.show(`Follow-up recorded for ${ownerItems.length} items · next check in ${days} day${days > 1 ? "s" : ""}`, "success");
          router.back();
        })
        .catch((e: any) => toast.show(e?.message ?? "Could not record", "error"));
      return;
    }
    action.mutate({ path: "/followup-sent", json: { checkDays: days, text: draft } }, {
      onSuccess: () => {
        setSentSheet(false);
        toast.show(`Follow-up recorded · next check in ${days} day${days > 1 ? "s" : ""}`, "success");
        router.back();
      },
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="followup-screen">
      <ScreenHeader title={ownerName ? "Follow up on everything" : "Follow Up"} />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <View style={{ alignItems: "center" }}>
          <IconBox name="chatbubble-ellipses-outline" size={64} />
        </View>
        <Text style={styles.title}>{ownerName ? `One message for ${ownerName}` : "AI draft ready"}</Text>
        <Text style={styles.sub}>{ownerName ? `Covers all ${ownerItems.length} open item${ownerItems.length === 1 ? "" : "s"}. ` : ""}You can edit before sending. Await never sends messages for you.</Text>
        {ownerName ? (
          <View style={styles.itemsCard} testID="followup-owner-items">
            {ownerItems.map((it) => (
              <Text key={it.id} style={styles.itemLine} numberOfLines={1}>• {it.commitment}{amountLabel(it) ? ` · ${amountLabel(it)}` : ""}{it.expectedAt ? ` · ${dayjs(it.expectedAt).format("MMM D")}` : ""}</Text>
            ))}
          </View>
        ) : null}
        <Chips<Tone>
          testID="followup-tone"
          value={tone}
          onChange={(t) => { setTone(t); generate(t); }}
          options={[{ key: "Polite", label: "Polite" }, { key: "Firm", label: "Firm" }, { key: "Casual", label: "Casual" }, { key: "Professional", label: "Professional" }]}
        />
        <View style={styles.draftCard}>
          <TextInput
            testID="followup-draft-input"
            value={busy ? "Drafting…" : draft}
            onChangeText={setDraft}
            multiline
            editable={!busy}
            style={[styles.draft, busy && { color: colors.muted }]}
            placeholderTextColor={colors.muted}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Copy" icon="copy-outline" variant="outline" onPress={copy} testID="followup-copy-button" style={{ flex: 1 }} disabled={busy} />
          <Button title="Open app" icon="open-outline" variant="outline" onPress={openApp} testID="followup-open-app-button" style={{ flex: 1 }} disabled={busy} />
        </View>
        <Button title="I sent this follow-up" icon="checkmark" onPress={() => setSentSheet(true)} testID="followup-sent-button" disabled={busy} />
        <Button title="Regenerate" variant="ghost" icon="refresh-outline" onPress={() => generate(tone)} testID="followup-regenerate-button" disabled={busy} />
      </KeyboardAwareScrollView>

      <Sheet
        visible={sentSheet}
        onClose={() => setSentSheet(false)}
        icon="alarm-outline"
        title="When should Await check again?"
        subtitle="We’ll remind you if there’s still no reply."
        testID="check-again-sheet"
        options={[
          { key: "1", label: "Tomorrow" },
          { key: "3", label: "3 days" },
          { key: "7", label: "Next week" },
          { key: "14", label: "Custom (2 weeks)" },
        ]}
        onSelect={(k) => recordSent(parseInt(k, 10))}
      />
      <FreeLimitAi visible={aiLimit} onClose={() => setAiLimit(false)} onManual={() => setAiLimit(false)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  sub: { fontSize: 14, color: c.muted, textAlign: "center" },
  itemsCard: { backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 12, gap: 4 },
  itemLine: { fontSize: 13.5, color: c.onSurfaceSecondary },
  draftCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, minHeight: 200 },
  draft: { fontSize: 15, lineHeight: 23, color: c.onSurface, minHeight: 170, textAlignVertical: "top" },
}));
