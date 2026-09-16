import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, IconBox, ScreenHeader, Banner } from "@/src/components/ui";
import { captureStore } from "@/src/capture-store";
import { analyzeCurrent } from "@/src/analyze";
import { useToast } from "@/src/components/Toast";
import { FreeLimitAi } from "@/app/capture/share";

export default function Screenshot() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiLimit, setAiLimit] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return setBlocked(true);
      const r = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!r.granted) return toast.show("Permission needed to pick a screenshot", "error");
    }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, base64: true });
    if (!res.canceled) setAsset(res.assets[0]);
  };

  const useThis = async () => {
    if (!asset) return;
    captureStore.set({ sourceType: "SCREENSHOT", items: [{ kind: "image", uri: asset.uri, base64: asset.base64 ?? undefined, mimeType: asset.mimeType ?? "image/jpeg", fileName: asset.fileName ?? "screenshot.jpg" }] });
    setBusy(true);
    try {
      await analyzeCurrent();
    } catch (e: any) {
      if (e?.status === 402) setAiLimit(true);
      else {
        captureStore.patch({ failed: true });
        router.replace("/capture/confirm");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="screenshot-screen">
      <ScreenHeader title="Screenshot" />
      <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        {asset ? (
          <>
            <Image source={{ uri: asset.uri }} style={styles.preview} contentFit="contain" />
            <Text style={styles.title}>Screenshot captured</Text>
            <Text style={styles.sub}>Review and confirm</Text>
            <Text style={styles.note}>Await only processes the screenshot you selected.</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Button title="Retake" variant="outline" onPress={() => setAsset(null)} testID="screenshot-retake-button" style={{ flex: 1 }} />
              <Button title="Use this" onPress={useThis} loading={busy} testID="screenshot-use-button" style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <View style={{ alignItems: "center", marginTop: 24 }}>
              <IconBox name="image-outline" size={88} />
            </View>
            <Text style={styles.title}>Select a screenshot</Text>
            <Text style={styles.sub}>Pick a screenshot or photo of a message, receipt, order page or document. Await will read it and suggest the details.</Text>
            <Banner icon="lock-closed-outline" text="Await only processes the screenshot you selected." />
            {blocked ? (
              <Pressable testID="screenshot-open-settings" onPress={() => Linking.openSettings()} style={styles.settings}>
                <Text style={{ color: colors.onSurface, textAlign: "center" }}>Photo access is blocked. Open Settings to allow it.</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Button title="Choose from gallery" icon="images-outline" onPress={() => pick(false)} testID="screenshot-gallery-button" />
            <Button title="Take a photo" icon="camera-outline" variant="outline" onPress={() => pick(true)} testID="screenshot-camera-button" />
          </>
        )}
      </View>
      <FreeLimitAi visible={aiLimit} onClose={() => setAiLimit(false)} onManual={() => router.replace("/capture/manual")} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: 10 },
  preview: { width: "100%", flex: 1, borderRadius: radius.lg, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, textAlign: "center", marginTop: 8 },
  sub: { fontSize: 14.5, color: c.muted, textAlign: "center", lineHeight: 20 },
  note: { fontSize: 12.5, color: c.muted, textAlign: "center" },
  settings: { backgroundColor: c.warningTint, borderRadius: 14, padding: 12 },
}));
