import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { setColorScheme, type ColorScheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type Appearance = "system" | "light" | "dark" | "timeofday";

/** Time-of-day → theme: bright by day, dimmed at dusk, dark at night. */
export function schemeForHour(h: number): ColorScheme {
  if (h >= 7 && h < 17) return "light";
  if (h >= 17 && h < 20) return "dim";
  return "dark";
}

function applyAppearance(a: Appearance) {
  if (a === "system") setColorScheme(null);
  else if (a === "timeofday") setColorScheme(schemeForHour(new Date().getHours()));
  else setColorScheme(a);
}

interface Prefs {
  appearance: Appearance;
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

const Ctx = createContext<{ prefs: Prefs; ready: boolean; update: (p: Partial<Prefs>) => void } | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string | null>(KEY, null);
      let p = DEFAULTS;
      if (raw) {
        try {
          p = { ...DEFAULTS, ...JSON.parse(raw) };
        } catch {}
      }
      setPrefs(p);
      applyAppearance(p.appearance);
      setReady(true);
    })();
  }, []);

  // Time-of-day theme: re-evaluate on an interval and whenever the app returns to foreground.
  useEffect(() => {
    if (prefs.appearance !== "timeofday") return;
    applyAppearance("timeofday");
    const timer = setInterval(() => applyAppearance("timeofday"), 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") applyAppearance("timeofday");
    });
    return () => { clearInterval(timer); sub.remove(); };
  }, [prefs.appearance]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      storage.setItem(KEY, JSON.stringify(next));
      if (patch.appearance) applyAppearance(patch.appearance);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, ready, update }), [prefs, ready, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefs outside provider");
  return v;
}
