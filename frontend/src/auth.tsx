import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";

import { api, loadToken, setToken, setUnauthorizedHandler, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";
import type { User } from "@/src/types";

WebBrowser.maybeCompleteAuthSession();

interface AuthCtx {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

const SESSION_RX = /[?#&]session_id=([^&#]+)/;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const used = useRef(new Set<string>());
  const qc = useQueryClient();

  const persist = useCallback(async (token: string, u: User) => {
    setToken(token);
    await storage.secureSet(TOKEN_KEY, token);
    setUser(u);
  }, []);

  const exchange = useCallback(
    async (sessionId: string) => {
      if (used.current.has(sessionId)) return;
      used.current.add(sessionId);
      try {
        const r = await api<{ session_token: string; user: User }>("/auth/session", { method: "POST", json: { session_id: sessionId } });
        await persist(r.session_token, r.user);
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("session_id");
          url.hash = url.hash.replace(/[#&]?session_id=[^&]+/, "");
          window.history.replaceState(window.history.state, "", url.toString());
        }
      } catch (e) {
        console.warn("session exchange failed", e);
      }
    },
    [persist],
  );

  const refresh = useCallback(async () => {
    try {
      const u = await api<User>("/auth/me");
      setUser(u);
    } catch {
      setToken(null);
      await storage.secureRemove(TOKEN_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      storage.secureRemove(TOKEN_KEY);
      setUser(null);
    });
    (async () => {
      let sid: string | null = null;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        sid = window.location.hash.match(SESSION_RX)?.[1] ?? window.location.search.match(SESSION_RX)?.[1] ?? null;
      } else {
        const initial = await Linking.getInitialURL();
        sid = initial?.match(SESSION_RX)?.[1] ?? null;
      }
      if (sid) await exchange(sid);
      else {
        const t = await loadToken();
        if (t) await refresh();
      }
      setLoading(false);
    })();
    const sub = Linking.addEventListener("url", ({ url }) => {
      const m = url.match(SESSION_RX);
      if (m) exchange(m[1]);
    });
    return () => sub.remove();
  }, [exchange, refresh]);

  const loginEmail = useCallback(
    async (email: string, password: string) => {
      const r = await api<{ session_token: string; user: User }>("/auth/login", { method: "POST", json: { email, password } });
      await persist(r.session_token, r.user);
    },
    [persist],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const r = await api<{ session_token: string; user: User }>("/auth/register", { method: "POST", json: { name, email, password } });
      await persist(r.session_token, r.user);
    },
    [persist],
  );

  const continueAsGuest = useCallback(async () => {
    const r = await api<{ session_token: string; user: User }>("/auth/guest", { method: "POST" });
    await persist(r.session_token, r.user);
  }, [persist]);

  const loginGoogle = useCallback(async () => {
    const redirectUrl = Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      captured = url;
    });
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    sub.remove();
    const url = (result as any).url ?? captured ?? (await Linking.getInitialURL());
    const sid = url?.match(SESSION_RX)?.[1];
    if (sid) await exchange(sid);
  }, [exchange]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    setToken(null);
    await storage.secureRemove(TOKEN_KEY);
    qc.clear();
    setUser(null);
  }, [qc]);

  const value = useMemo(
    () => ({ user, loading, refresh, loginEmail, register, loginGoogle, continueAsGuest, logout, setUser }),
    [user, loading, refresh, loginEmail, register, loginGoogle, continueAsGuest, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
