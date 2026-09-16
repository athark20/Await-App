import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";
import { LogoMark } from "@/src/components/Logo";
import { storage } from "@/src/utils/storage";
import { usePrefs } from "@/src/prefs";

const PIN_KEY = "await.applock.pin";
const AUTO_LOCK_MS = 60 * 1000;

export async function savePin(pin: string) {
  await storage.secureSet(PIN_KEY, pin);
}
export async function hasPin() {
  return !!(await storage.secureGet<string | null>(PIN_KEY, null));
}
export async function clearPin() {
  await storage.secureRemove(PIN_KEY);
}

export async function biometricAvailable() {
  if (Platform.OS === "web") return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

/** Full-screen lock overlay: biometric (device passcode fallback) + 4-digit Await PIN. */
export function AppLockGate({ active, children }: { active: boolean; children: React.ReactNode }) {
  const { prefs } = usePrefs();
  const enabled = active && prefs.appLock;
  const [locked, setLocked] = useState(enabled);
  const bg = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) setLocked(false);
    else setLocked(true);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background" || s === "inactive") bg.current = Date.now();
      else if (s === "active" && bg.current && Date.now() - bg.current > AUTO_LOCK_MS) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  return (
    <>
      {children}
      {locked ? <LockScreen onUnlock={() => setLocked(false)} /> : null}
    </>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bio, setBio] = useState(false);

  const tryBiometric = useCallback(async () => {
    if (!(await biometricAvailable())) return;
    setBio(true);
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Await", fallbackLabel: "Use device passcode", cancelLabel: "Use Await PIN" });
    if (r.success) onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    tryBiometric();
  }, [tryBiometric]);

  const press = async (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      const saved = await storage.secureGet<string | null>(PIN_KEY, null);
      if (saved === next) onUnlock();
      else {
        setError("Wrong PIN. Try again.");
        setTimeout(() => setPin(""), 250);
      }
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} testID="app-lock-screen">
      <View style={{ alignItems: "center", gap: 10 }}>
        <View style={styles.badge}><LogoMark size={44} /></View>
        <Text style={styles.title}>Await is locked</Text>
        <Text style={styles.sub}>Enter your 4-digit Await PIN{bio ? " or use biometrics" : ""}</Text>
      </View>
      <View style={styles.dots} testID="app-lock-dots">
        {[0, 1, 2, 3].map((i) => <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled, error && { borderColor: colors.error }]} />)}
      </View>
      {error ? <Text style={styles.error} testID="app-lock-error">{error}</Text> : <Text style={styles.error}> </Text>}
      <View style={styles.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"].map((k) => (
          <Pressable
            key={k}
            testID={`app-lock-key-${k}`}
            onPress={() => (k === "del" ? setPin((p) => p.slice(0, -1)) : k === "bio" ? tryBiometric() : press(k))}
            style={({ pressed }) => [styles.key, pressed && { opacity: 0.6 }]}
          >
            {k === "del" ? <Icon name="backspace-outline" size={24} color={colors.onSurface} /> : k === "bio" ? <Icon name="finger-print-outline" size={26} color={colors.brandPrimary} /> : <Text style={styles.keyText}>{k}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surface, paddingHorizontal: 24, justifyContent: "space-between" },
  badge: { width: 76, height: 76, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: c.borderStrong },
  dotFilled: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  error: { color: c.error, textAlign: "center", fontSize: 13, minHeight: 18 },
  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, paddingHorizontal: 12 },
  key: { width: "28%", aspectRatio: 1.35, borderRadius: 18, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 24, fontWeight: "700", color: c.onSurface },
}));
