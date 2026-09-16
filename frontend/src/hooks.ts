import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import type { AwaitItem, Evidence, TimelineEvent } from "@/src/types";
import { cancelReminder, scheduleReminder } from "@/src/notifications";

export const keys = {
  awaits: ["awaits"] as const,
  item: (id: string) => ["awaits", id] as const,
  events: (id: string) => ["awaits", id, "events"] as const,
  evidence: (id: string) => ["awaits", id, "evidence"] as const,
  stats: ["stats"] as const,
};

export function useAwaits(params: Record<string, string | undefined> = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return useQuery({
    queryKey: [...keys.awaits, qs],
    queryFn: () => api<AwaitItem[]>(`/awaits${qs ? `?${qs}` : ""}`),
  });
}

export function useAwait(id: string) {
  return useQuery({ queryKey: keys.item(id), queryFn: () => api<AwaitItem>(`/awaits/${id}`), enabled: !!id });
}

export function useEvents(id: string) {
  return useQuery({ queryKey: keys.events(id), queryFn: () => api<TimelineEvent[]>(`/awaits/${id}/events`), enabled: !!id });
}

export function useEvidence(id: string) {
  return useQuery({ queryKey: keys.evidence(id), queryFn: () => api<Evidence[]>(`/awaits/${id}/evidence`), enabled: !!id });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api("/stats") });
}

export function useInvalidateAwaits() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: keys.awaits });
    qc.invalidateQueries({ queryKey: keys.stats });
    if (id) {
      qc.invalidateQueries({ queryKey: keys.item(id) });
      qc.invalidateQueries({ queryKey: keys.events(id) });
      qc.invalidateQueries({ queryKey: keys.evidence(id) });
    }
  };
}

export function useAwaitAction(id: string) {
  const invalidate = useInvalidateAwaits();
  return useMutation({
    mutationFn: ({ path, json, method = "POST" }: { path: string; json?: any; method?: string }) =>
      api<AwaitItem>(`/awaits/${id}${path}`, { method, json }),
    onSuccess: (item) => {
      invalidate(id);
      if (item?.state === "DONE") cancelReminder(id);
      else if (item) scheduleReminder(item);
    },
  });
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/health`, { method: "GET" });
        if (alive) setOnline(r.ok);
      } catch {
        if (alive) setOnline(false);
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return online;
}
