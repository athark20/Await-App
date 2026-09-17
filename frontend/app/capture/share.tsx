import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, IconBox, Pill, ScreenHeader, Banner } from "@/src/components/ui";
import { captureStore, type SharedItem } from "@/src/capture-store";
import { analyzeCurrent, isAiReadable } from "@/src/analyze";
import { Sheet } from "@/src/components/Sheet";

export default function SharePreview() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const payload = captureStore.get();
  const [busy, setBusy] = useState(false);
  const [aiLimit, setAiLimit] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const items = payload?.items ?? [];
  const multi = items.length > 1;

  const analyze = async (subset?: SharedItem[]) => {
    const list = subset ?? items;
    if (list.some((i) => !isAiReadable(i))) return setUnsupported(true);
    setBusy(true);
    try {
      await analyzeCurrent(list);
    } catch (e: any) {
      if (e?.status === 402) setAiLimit(true);
      else {
        captureStore.patch({ failed: true, extraction: null, match: null });
        router.replace("/capture/confirm");
      }
    } finally {
      setBusy(false);
    }
  };

  const manual = () => router.replace("/capture/manual");

  if (!payload) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader title="Shared to Await" />
        <Text style={styles.empty}>Nothing was received.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="share-preview-screen">
      <ScreenHeader title="Shared to Await" onBack={() => { captureStore.clear(); router.replace("/(tabs)"); }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <View style={styles.metaRow}>
          <Text style={styles.received} testID="share-received-count">
            {multi ? `${items.length} items received` : "1 item received"}
          </Text>
          {items[0]?.appLabel ? <Pill text={`from ${items[0].appLabel}`} tone="brand" /> : null}
        </View>
        {items.map((it, i) => (
          <View key={i} style={styles.card} testID={`share-item-${i}`}>
            {it.kind === "image" && it.uri ? (
              <Image source={{ uri: it.uri }} style={styles.image} contentFit="cover" />
            ) : it.kind === "document" ? (
              <View style={styles.docRow}>
                <IconBox name="document-text-outline" size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName} numberOfLines={1}>{it.fileName ?? "Document"}</Text>
                  <Text style={styles.docType}>{it.mimeType ?? "file"}</Text>
                </View>
              </View>
            ) : it.kind === "url" ? (
              <View style={styles.docRow}>
                <IconBox name="link-outline" size={44} />
                <View style={{ flex: 1 }}>
                  {it.title ? <Text style={styles.docName} numberOfLines={2}>{it.title}</Text> : null}
                  <Text style={styles.url} numberOfLines={2}>{it.text}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.text} testID={`share-item-text-${i}`}>{it.text}</Text>
            )}
          </View>
        ))}
        <View style={{ marginTop: 8 }}>
          <Banner icon="sparkles-outline" text={multi ? "If these describe one commitment, analyze them together to create a single Await with multiple evidence items." : "Await will read this and suggest who, what and when. Nothing is saved until you confirm."} testID="share-hint" />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {busy ? (
          <View style={styles.analyzing} testID="share-analyzing">
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.analyzingText}>Analyzing…</Text>
          </View>
        ) : multi ? (
          <>
            <Button title="Analyze together" icon="sparkles-outline" onPress={() => analyze()} testID="share-analyze-together-button" />
            <Button title="Review individually" variant="outline" onPress={() => analyze([items[0]])} testID="share-review-individually-button" />
          </>
        ) : (
          <>
            <Button title="Analyze" icon="sparkles-outline" onPress={() => analyze()} testID="share-analyze-button" />
            <Pressable onPress={manual} style={styles.manualLink} testID="share-enter-manually-link">
              <Text style={styles.manualText}>Enter manually instead</Text>
            </Pressable>
          </>
        )}
      </View>

      <FreeLimitAi visible={aiLimit} onClose={() => setAiLimit(false)} onManual={manual} />
      <Sheet
        visible={unsupported}
        onClose={() => setUnsupported(false)}
        icon="document-outline"
        tone="warning"
        title="This file type isn’t supported yet."
        subtitle="Await can read text, images, PDF, DOCX, XLSX and CSV. Legacy .doc/.xls aren’t supported yet — you can still attach this file as evidence."
        primary={{ title: "Enter manually", onPress: () => { setUnsupported(false); manual(); } }}
        secondary={{ title: "Choose another file", onPress: () => { setUnsupported(false); captureStore.clear(); router.replace("/(tabs)/add"); } }}
        testID="unsupported-sheet"
      />
    </View>
  );
}

export function FreeLimitAi({ visible, onClose, onManual }: { visible: boolean; onClose: () => void; onManual: () => void }) {
  const router = useRouter();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="sparkles-outline"
      tone="warning"
      title="AI limit reached"
      subtitle="You’ve used your 5 free AI extractions this month. Upgrade to Pro for more, or enter the details manually."
      primary={{ title: "Upgrade to Pro", onPress: () => { onClose(); router.push("/settings/upgrade"); } }}
      secondary={{ title: "Enter manually", onPress: () => { onClose(); onManual(); } }}
      testID="ai-limit-sheet"
    />
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.xl, gap: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  received: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg },
  text: { fontSize: 15, color: c.onSurface, lineHeight: 22 },
  image: { width: "100%", height: 260, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  docName: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  docType: { fontSize: 12.5, color: c.muted, marginTop: 2 },
  url: { fontSize: 13, color: c.brandPrimary, marginTop: 2 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingTop: 12, gap: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider },
  analyzing: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  analyzingText: { color: c.muted, fontWeight: "600" },
  manualLink: { height: 40, alignItems: "center", justifyContent: "center" },
  manualText: { color: c.brandPrimary, fontWeight: "600" },
  empty: { color: c.muted, textAlign: "center", marginTop: 40 },
}));
