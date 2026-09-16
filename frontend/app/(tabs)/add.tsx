import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Icon, IconBox, Banner } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { usesNativeTabs } from "@/src/navigation";
import { openIncomingShare } from "@/src/share-intent";
import { useToast } from "@/src/components/Toast";

export default function Add() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [simulate, setSimulate] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const pickShared = async (key: string) => {
    setSimulate(false);
    if (key === "text") openIncomingShare([{ kind: "text", text: "Sameer:\nI’ll send you the quotation by Friday.", appLabel: "WhatsApp" }]);
    else if (key === "update") openIncomingShare([{ kind: "text", text: "Sameer:\nSorry, I’ll send it Monday.", appLabel: "WhatsApp" }]);
    else if (key === "resolved") openIncomingShare([{ kind: "text", text: "Amazon: Your refund of ₹3,499 has been processed to your original payment method.", appLabel: "Gmail" }]);
    else if (key === "url") openIncomingShare([{ kind: "url", text: "https://www.amazon.in/gp/your-account/order-details?orderID=408-1234567-8901234", title: "Your Orders — Amazon.in", appLabel: "Chrome" }]);
    else if (key === "image") {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, base64: true, allowsMultipleSelection: true, selectionLimit: 3 });
      if (r.canceled) return;
      openIncomingShare(r.assets.map((a) => ({ kind: "image" as const, uri: a.uri, base64: a.base64 ?? undefined, mimeType: a.mimeType ?? "image/jpeg", fileName: a.fileName ?? "screenshot.jpg", appLabel: "Gallery" })));
    } else if (key === "doc") {
      const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "text/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], copyToCacheDirectory: true });
      if (r.canceled) return;
      const a = r.assets[0];
      openIncomingShare([{ kind: "document", uri: a.uri, mimeType: a.mimeType ?? "application/octet-stream", fileName: a.name, appLabel: "Files" }]);
    }
  };

  return (
    <View style={styles.root} testID="add-screen">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: bottomChrome + 24 }]}>
        <View style={{ alignItems: "center", gap: 8, marginBottom: 20 }}>
          <IconBox name="add-outline" size={72} />
          <Text style={styles.title}>Add to Await</Text>
          <Text style={styles.sub}>Capture it in seconds.</Text>
        </View>

        <Option testID="add-share-option" icon="share-social-outline" title="Share from another app" subtitle="Text, image, link or document" onPress={() => setSimulate(true)} />
        <Option testID="add-screenshot-option" icon="image-outline" title="Take/select a screenshot" subtitle="Import and extract details" onPress={() => router.push("/capture/screenshot")} />
        <Option testID="add-voice-option" icon="mic-outline" title="Voice input" subtitle="e.g. “Amazon said refund in 7 days”" onPress={() => router.push("/capture/voice")} />
        <Option testID="add-manual-option" icon="create-outline" title="Type manually" subtitle="Add details yourself" onPress={() => router.push("/capture/manual")} />

        <View style={{ marginTop: 12 }}>
          <Banner icon="shield-checkmark-outline" text="Await only processes content you choose to share. Nothing is read from your inbox or other apps." testID="add-privacy-banner" />
        </View>
        <Text style={styles.formats}>Supported: text · images · PDF · DOC/DOCX · CSV · XLS/XLSX · links</Text>
      </ScrollView>

      <Sheet
        visible={simulate}
        onClose={() => setSimulate(false)}
        icon="share-social-outline"
        title="Share to Await"
        subtitle="From any app: tap Share → Await. In this preview you can simulate an incoming share below."
        testID="share-simulate-sheet"
        options={[
          { key: "text", label: "Shared message (new Await)", subtitle: "“Sameer: I’ll send you the quotation by Friday.”", icon: "chatbubble-outline" },
          { key: "update", label: "Shared update (date change)", subtitle: "“Sorry, I’ll send it Monday.”", icon: "time-outline" },
          { key: "resolved", label: "Shared update (possible resolution)", subtitle: "“Your refund of ₹3,499 has been processed.”", icon: "checkmark-circle-outline" },
          { key: "url", label: "Shared link", subtitle: "Amazon order page", icon: "link-outline" },
          { key: "image", label: "Shared screenshot(s)", subtitle: "Pick up to 3 images", icon: "images-outline" },
          { key: "doc", label: "Shared document", subtitle: "PDF, DOCX, CSV, XLSX", icon: "document-attach-outline" },
        ]}
        onSelect={(k) => pickShared(k).catch((e) => toast.show(e?.message ?? "Could not open picker", "error"))}
      />
    </View>
  );
}

function Option({ icon, title, subtitle, onPress, testID }: { icon: string; title: string; subtitle: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}>
      <IconBox name={icon} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optTitle}>{title}</Text>
        <Text style={styles.optSub}>{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, marginTop: 6 },
  sub: { fontSize: 14, color: c.muted },
  option: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 10 },
  optTitle: { fontSize: 15.5, fontWeight: "700", color: c.onSurface },
  optSub: { fontSize: 13, color: c.muted, marginTop: 2 },
  formats: { fontSize: 12, color: c.muted, textAlign: "center", marginTop: 12 },
}));
