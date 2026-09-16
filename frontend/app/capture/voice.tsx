import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import { File } from "expo-file-system";
import { makeStyles, spacing, useTheme } from "@/src/theme";
import { Button, Field, Icon, ScreenHeader, Banner } from "@/src/components/ui";
import { captureStore } from "@/src/capture-store";
import { analyzeCurrent } from "@/src/analyze";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";
import { FreeLimitAi } from "@/app/capture/share";

export default function Voice() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { user } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 500);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState<"transcribe" | "analyze" | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [aiLimit, setAiLimit] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
  }, []);

  const start = async () => {
    const perm = await AudioModule.getRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return setBlocked(true);
      const r = await AudioModule.requestRecordingPermissionsAsync();
      if (!r.granted) return toast.show("Microphone access is needed for voice capture", "error");
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stop = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    setBusy("transcribe");
    try {
      const b64 = await new File(uri).base64();
      const r = await api<{ transcript: string }>("/ai/transcribe", { method: "POST", json: { audio_base64: b64, mime_type: Platform.OS === "web" ? "audio/webm" : "audio/m4a" } });
      setTranscript(r.transcript);
    } catch (e: any) {
      toast.show(e?.message ?? "Couldn’t transcribe. You can type instead.", "error");
    } finally {
      setBusy(null);
    }
  };

  const analyze = async () => {
    if (!transcript.trim()) return;
    captureStore.set({ sourceType: "VOICE", items: [{ kind: "text", text: transcript.trim(), appLabel: "Voice" }] });
    setBusy("analyze");
    try {
      await analyzeCurrent();
    } catch (e: any) {
      if (e?.status === 402) setAiLimit(true);
      else {
        captureStore.patch({ failed: true });
        router.replace("/capture/confirm");
      }
    } finally {
      setBusy(null);
    }
  };

  const secs = Math.floor((state.durationMillis ?? 0) / 1000);
  const pro = user?.plan === "PRO";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="voice-screen">
      <ScreenHeader title="Voice input" />
      <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>Say what you’re waiting for</Text>
        <Text style={styles.sub}>e.g. “Sameer said he’ll send the quotation on Friday.”</Text>
        {!pro ? <Banner icon="star-outline" tone="warning" text="Voice capture is a Pro feature. You can try it here; typed text always works on Free." /> : null}

        <View style={styles.micWrap}>
          <Pressable
            testID="voice-record-button"
            onPress={state.isRecording ? stop : start}
            style={[styles.mic, state.isRecording && styles.micActive]}
          >
            <Icon name={state.isRecording ? "stop" : "mic"} size={40} color={state.isRecording ? colors.onError : colors.onBrandPrimary} />
          </Pressable>
          <Text style={styles.micLabel} testID="voice-status">
            {busy === "transcribe" ? "Transcribing…" : state.isRecording ? `Recording… ${secs}s · tap to stop` : "Tap to record"}
          </Text>
        </View>

        {blocked ? (
          <Pressable testID="voice-open-settings" onPress={() => Linking.openSettings()} style={styles.settings}>
            <Text style={{ color: colors.onSurface, textAlign: "center" }}>Microphone is blocked. Open Settings to allow it.</Text>
          </Pressable>
        ) : null}

        <Field label="Transcript (editable)" placeholder="Your words will appear here — or type them" value={transcript} onChangeText={setTranscript} multiline testID="voice-transcript-input" />
        <View style={{ flex: 1 }} />
        <Button title="Extract details" icon="sparkles-outline" onPress={analyze} loading={busy === "analyze"} disabled={!transcript.trim()} testID="voice-analyze-button" />
      </View>
      <FreeLimitAi visible={aiLimit} onClose={() => setAiLimit(false)} onManual={() => router.replace("/capture/manual")} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  sub: { fontSize: 14, color: c.muted, textAlign: "center" },
  micWrap: { alignItems: "center", gap: 12, paddingVertical: 16 },
  mic: { width: 96, height: 96, borderRadius: 48, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  micActive: { backgroundColor: c.error },
  micLabel: { color: c.muted, fontSize: 14, fontWeight: "600" },
  settings: { backgroundColor: c.warningTint, borderRadius: 14, padding: 12 },
}));
