import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setColorScheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type Appearance = "system" | "light" | "dark";

interface Prefs {
  appearance: Appearance;
  defaultSnoozeDays: number;
  dateFormat: "DMY" | "MDY";
  notifDue: boolean;
  notifOverdue: boolean;
  notifDigest: boolean;
  notifDaily: boolean;
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
      setColorScheme(p.appearance === "system" ? null : p.appearance);
      setReady(true);
    })();
  }, []);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      storage.setItem(KEY, JSON.stringify(next));
      if (patch.appearance) setColorScheme(patch.appearance === "system" ? null : patch.appearance);
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
