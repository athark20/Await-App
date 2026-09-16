import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import { File } from "expo-file-system";
import { makeStyles, radius, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";
import { captureStore } from "@/src/capture-store";
import { analyzeCurrent } from "@/src/analyze";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";

type Phase = "idle" | "recording" | "transcribing" | "analyzing";

/**
 * One-tap voice capture for the Add tab: tap → listens, tap again → transcribes, extracts
 * ("landlord owes me the deposit by Friday") and lands straight on the confirm screen.
 */
export function QuickVoice({ onAiLimit }: { onAiLimit: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 500);
  const [phase, setPhase] = useState<Phase>("idle");
  const [blocked, setBlocked] = useState(false);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (Platform.OS !== "web") setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (phase === "recording") {
      pulse.value = withRepeat(withSequence(withTiming(1.35, { duration: 700, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 700 })), -1, false);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [phase, pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.4 - pulse.value }));

  const start = async () => {
    const perm = await AudioModule.getRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return setBlocked(true);
      const r = await AudioModule.requestRecordingPermissionsAsync();
      if (!r.granted) return toast.show("Microphone access is needed for voice capture", "error");
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase("recording");
  };

  const stop = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return setPhase("idle");
    setPhase("transcribing");
    let transcript = "";
    try {
      const b64 = await new File(uri).base64();
      const r = await api<{ transcript: string }>("/ai/transcribe", { method: "POST", json: { audio_base64: b64, mime_type: Platform.OS === "web" ? "audio/webm" : "audio/m4a" } });
      transcript = r.transcript.trim();
    } catch (e: any) {
      setPhase("idle");
      if (e?.status === 402) return onAiLimit();
      toast.show("Couldn’t hear that clearly. Try again or type it.", "error");
      return router.push("/capture/voice");
    }
    if (!transcript) {
      setPhase("idle");
      return toast.show("Didn’t catch anything. Tap and speak, then tap again.", "error");
    }
    setPhase("analyzing");
    captureStore.set({ sourceType: "VOICE", items: [{ kind: "text", text: transcript, appLabel: "Voice" }] });
    try {
      await analyzeCurrent();
    } catch (e: any) {
      if (e?.status === 402) onAiLimit();
      else {
        captureStore.patch({ failed: true });
        router.push("/capture/confirm");
      }
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase === "transcribing" || phase === "analyzing";
  const secs = Math.floor((state.durationMillis ?? 0) / 1000);
  const label = phase === "recording" ? `Listening… ${secs}s · tap when done` : phase === "transcribing" ? "Transcribing…" : phase === "analyzing" ? "Turning it into an Await…" : "Tap and say who owes you what, and by when";

  return (
    <View style={styles.card} testID="quick-voice">
      <View style={styles.row}>
        <View style={styles.micWrap}>
          {phase === "recording" ? <Animated.View style={[styles.ring, ring]} /> : null}
          <Pressable
            testID="quick-voice-button"
            accessibilityLabel={phase === "recording" ? "Stop recording" : "Start voice capture"}
            onPress={phase === "recording" ? stop : start}
            disabled={busy}
            style={({ pressed }) => [styles.mic, phase === "recording" && styles.micActive, pressed && { opacity: 0.9 }]}
          >
            <Icon name={busy ? "hourglass-outline" : phase === "recording" ? "stop" : "mic"} size={28} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.title}>{phase === "idle" ? "Say it, we’ll file it" : phase === "recording" ? "Listening" : "Working on it"}</Text>
          <Text style={styles.sub} testID="quick-voice-status">{label}</Text>
          {phase === "idle" ? <Text style={styles.example}>“Landlord owes me the deposit by Friday”</Text> : null}
        </View>
      </View>
      {blocked ? (
        <Pressable testID="quick-voice-open-settings" onPress={() => Linking.openSettings()} style={styles.settings}>
          <Icon name="settings-outline" size={14} color={colors.brandPrimary} />
          <Text style={styles.settingsText}>Microphone is off. Open Settings to allow it.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.brandTertiary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  micWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 64, height: 64, borderRadius: 32, backgroundColor: c.error },
  mic: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  micActive: { backgroundColor: c.error },
  title: { fontSize: 15.5, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.onSurfaceSecondary },
  example: { fontSize: 12.5, color: c.brandPrimary, fontStyle: "italic", marginTop: 2 },
  settings: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingsText: { fontSize: 12.5, color: c.brandPrimary, fontWeight: "600" },
}));
