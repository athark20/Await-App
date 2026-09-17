import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { setColorScheme, type ColorScheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type Appearance = "system" | "light" | "dark" | "timeofday";
export type Phase = "morning" | "afternoon" | "dusk" | "night";
export type PhaseOrSystem = Phase | "system";

export interface Schedule {
  morning: number; // hour each phase STARTS (0-23)
  afternoon: number;
  dusk: number;
  night: number;
}

/** Which phase a given hour falls into, per the user's schedule. Night wraps past midnight. */
export function phaseForHour(h: number, s: Schedule): Phase {
  if (h >= s.morning && h < s.afternoon) return "morning";
  if (h >= s.afternoon && h < s.dusk) return "afternoon";
  if (h >= s.dusk && h < s.night) return "dusk";
  return "night";
}

/** Each phase maps to a color palette: day = light, dusk = dim, night = dark. */
export function schemeForPhase(p: Phase): ColorScheme {
  if (p === "morning" || p === "afternoon") return "light";
  if (p === "dusk") return "dim";
  return "dark";
}

interface Prefs {
  appearance: Appearance;
  schedule: Schedule;
  defaultSnoozeDays: number;
  dateFormat: "DMY" | "MDY";
  notifDue: boolean;
  notifOverdue: boolean;
  notifDigest: boolean;
  notifDaily: boolean;
  digestHour: number;
  digestMinute: number;
  notifWeekly: boolean;
  calendarSync: boolean;
  quietHours: boolean;
  appLock: boolean;
  onboarded: boolean;
  notifAsked: boolean;
}

const DEFAULTS: Prefs = {
  appearance: "system",
  schedule: { morning: 6, afternoon: 12, dusk: 17, night: 20 },
  defaultSnoozeDays: 1,
  dateFormat: "DMY",
  notifDue: true,
  notifOverdue: true,
  notifDigest: true,
  notifDaily: false,
  digestHour: 9,
  digestMinute: 0,
  notifWeekly: true,
  calendarSync: false,
  quietHours: true,
  appLock: false,
  onboarded: false,
  notifAsked: false,
};

const KEY = "await.prefs";

/** Resolve the wallpaper phase + color scheme for the current prefs/time. */
function resolve(p: Prefs): { phase: PhaseOrSystem; scheme: ColorScheme | null } {
  if (p.appearance === "system") return { phase: "system", scheme: null };
  if (p.appearance === "light") return { phase: "afternoon", scheme: "light" };
  if (p.appearance === "dark") return { phase: "night", scheme: "dark" };
  const ph = phaseForHour(new Date().getHours(), p.schedule);
  return { phase: ph, scheme: schemeForPhase(ph) };
}

const Ctx = createContext<{ prefs: Prefs; ready: boolean; phase: PhaseOrSystem; update: (p: Partial<Prefs>) => void } | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [phase, setPhase] = useState<PhaseOrSystem>("system");
  const [ready, setReady] = useState(false);

  const apply = useCallback((p: Prefs) => {
    const r = resolve(p);
    setColorScheme(r.scheme);
    setPhase(r.phase);
  }, []);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string | null>(KEY, null);
      let p = DEFAULTS;
      if (raw) {
        try {
          p = { ...DEFAULTS, ...JSON.parse(raw), schedule: { ...DEFAULTS.schedule, ...(JSON.parse(raw).schedule || {}) } };
        } catch {}
      }
      setPrefs(p);
      apply(p);
      setReady(true);
    })();
  }, [apply]);

  // Time-of-day theme: re-evaluate on an interval and whenever the app returns to foreground.
  useEffect(() => {
    if (prefs.appearance !== "timeofday") return;
    apply(prefs);
    const timer = setInterval(() => apply(prefs), 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") apply(prefs);
    });
    return () => { clearInterval(timer); sub.remove(); };
  }, [prefs.appearance, prefs.schedule, apply, prefs]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      storage.setItem(KEY, JSON.stringify(next));
      apply(next);
      return next;
    });
  }, [apply]);

  const value = useMemo(() => ({ prefs, ready, phase, update }), [prefs, ready, phase, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefs outside provider");
  return v;
}
