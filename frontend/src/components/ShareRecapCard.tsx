import React, { useRef, useState } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import dayjs from "dayjs";
import { Sheet } from "@/src/components/Sheet";
import { LogoMark } from "@/src/components/Logo";
import { useToast } from "@/src/components/Toast";
import { money } from "@/src/format";
import type { WeeklyRecap } from "@/src/hooks";

// Brand card colours are fixed (it's an exported image, identical in both themes).
const CARD = { bg: "#07111F", panel: "#0E1B2B", text: "#F7F9FC", muted: "rgba(247,249,252,0.65)", blue: "#168CFF", amber: "#FFB020", green: "#22C55E", red: "#FF4D4D", border: "rgba(255,255,255,0.10)" };

function shareText(r: WeeklyRecap) {
  const lines = [
    `My week in Await (${dayjs(r.weekStart).format("D MMM")} – ${dayjs(r.weekEnd).format("D MMM")})`,
    r.headline,
    `✅ ${r.counts.resolved} resolved · ⏳ ${r.counts.slipped} slipped · 📨 ${r.counts.followups} follow-ups · ${r.counts.open} still open`,
  ];
  if (r.money.recovered) lines.push(`💸 ${money(r.money.recovered, r.money.currency)} recovered`);
  lines.push("Follow up. Close the loop. — Await");
  return lines.join("\n").replace(" — ", " · ");
}

/** Shareable "Your week" card: preview + Share image (native) / share text or download (web). */
export function ShareRecapSheet({ visible, onClose, recap, userName }: { visible: boolean; onClose: () => void; recap: WeeklyRecap; userName?: string }) {
  const ref = useRef<View>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(ref, { format: "png", quality: 1, result: Platform.OS === "web" ? "data-uri" : "tmpfile" });
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = uri;
        a.download = `await-week-${dayjs(recap.weekEnd).format("YYYY-MM-DD")}.png`;
        a.click();
        toast.show("Image downloaded", "success");
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your week" });
      } else {
        await Share.share({ message: shareText(recap) });
      }
    } catch {
      // Fall back to plain text so sharing never dead-ends
      try {
        await Share.share({ message: shareText(recap) });
      } catch {
        toast.show("Couldn’t share right now", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const shareAsText = async () => {
    try {
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText(recap));
        toast.show("Copied to clipboard", "success");
      } else await Share.share({ message: shareText(recap) });
    } catch {}
  };

  const c = recap.counts;
  return (
    <Sheet visible={visible} onClose={onClose} title="Share your week" subtitle="Post it, or send it to a partner or teammate." primary={{ title: busy ? "Preparing…" : "Share image", onPress: share, loading: busy }} secondary={{ title: Platform.OS === "web" ? "Copy as text" : "Share as text", onPress: shareAsText }} testID="share-recap-sheet">
      <View style={{ alignItems: "center", marginTop: 12 }}>
        <View ref={ref} collapsable={false} style={styles.card} testID="share-recap-card">
          <View style={styles.head}>
            <LogoMark size={26} />
            <Text style={styles.brand}>Await</Text>
            <Text style={styles.range}>{dayjs(recap.weekStart).format("D MMM")} – {dayjs(recap.weekEnd).format("D MMM")}</Text>
          </View>
          <Text style={styles.kicker}>{userName ? `${userName.split(" ")[0].toUpperCase()}’S WEEK` : "MY WEEK"}</Text>
          <Text style={styles.headline}>{recap.headline}</Text>
          <View style={styles.grid}>
            <Stat label="Resolved" value={String(c.resolved)} color={CARD.green} />
            <Stat label="Slipped" value={String(c.slipped)} color={CARD.red} />
            <Stat label="Follow-ups" value={String(c.followups)} color={CARD.blue} />
            <Stat label="Still open" value={String(c.open)} color={CARD.amber} />
          </View>
          {recap.money.recovered || recap.money.owed ? (
            <Text style={styles.moneyLine}>
              {recap.money.recovered ? `${money(recap.money.recovered, recap.money.currency)} recovered` : ""}
              {recap.money.recovered && recap.money.owed ? " · " : ""}
              {recap.money.owed ? `${money(recap.money.owed, recap.money.currency)} still owed` : ""}
            </Text>
          ) : null}
          <View style={styles.foot}>
            <View style={styles.loopDot} />
            <Text style={styles.footText}>Follow up. Close the loop.</Text>
          </View>
        </View>
      </View>
    </Sheet>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 320, backgroundColor: CARD.bg, borderRadius: 24, padding: 20, gap: 12, borderWidth: 1, borderColor: CARD.border },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: { color: CARD.text, fontSize: 16, fontWeight: "800", flex: 1 },
  range: { color: CARD.muted, fontSize: 12 },
  kicker: { color: CARD.amber, fontSize: 11, fontWeight: "700", letterSpacing: 1.8, marginTop: 4 },
  headline: { color: CARD.text, fontSize: 20, fontWeight: "800", lineHeight: 26, marginTop: -4 },
  grid: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: CARD.panel, borderRadius: 14, paddingVertical: 12, alignItems: "center", gap: 2, borderWidth: 1, borderColor: CARD.border },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 10.5, color: CARD.muted },
  moneyLine: { color: CARD.blue, fontSize: 13, fontWeight: "700" },
  foot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  loopDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CARD.amber },
  footText: { color: CARD.muted, fontSize: 12, fontWeight: "600" },
});
