import React, { useEffect, useState } from "react";
import { Linking, Platform, Share, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Chips, IconBox, ScreenHeader } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { useAwait, useAwaitAction } from "@/src/hooks";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";
import { FreeLimitAi } from "@/app/capture/share";
import dayjs from "dayjs";

type Tone = "Polite" | "Firm" | "Casual" | "Professional";

export default function FollowUp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { user } = useAuth();
  const q = useAwait(id);
  const action = useAwaitAction(id);
  const [tone, setTone] = useState<Tone>("Polite");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiLimit, setAiLimit] = useState(false);
  const [sentSheet, setSentSheet] = useState(false);
  const item = q.data;

  const fallback = () =>
    item
      ? `Hi ${item.ownerName},\n\nI’m following up on ${item.commitment.charAt(0).toLowerCase() + item.commitment.slice(1)}. It was expected by ${item.expectedAt ? dayjs(item.expectedAt).format("MMM D, YYYY") : "the agreed date"}. Could you please confirm the status?\n\nThanks,\n${user?.name ?? ""}`
      : "";

  const generate = async (t: Tone) => {
    setBusy(true);
    try {
      const r = await api<{ draft: string }>(`/awaits/${id}/followup-draft`, { method: "POST", json: { tone: t } });
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
  }, [item?.id]);

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
      <ScreenHeader title="Follow Up" />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <View style={{ alignItems: "center" }}>
          <IconBox name="chatbubble-ellipses-outline" size={64} />
        </View>
        <Text style={styles.title}>AI draft ready</Text>
        <Text style={styles.sub}>You can edit before sending. Await never sends messages for you.</Text>
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
  draftCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, minHeight: 200 },
  draft: { fontSize: 15, lineHeight: 23, color: c.onSurface, minHeight: 170, textAlignVertical: "top" },
}));
