import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useNetwork } from "@/src/offline";
import type { AwaitItem, Evidence, TimelineEvent } from "@/src/types";
import { cancelReminder, scheduleReminder } from "@/src/notifications";

export const keys = {
  awaits: ["awaits"] as const,
  item: (id: string) => ["awaits", id] as const,
  events: (id: string) => ["awaits", id, "events"] as const,
  evidence: (id: string) => ["awaits", id, "evidence"] as const,
  stats: ["stats"] as const,
  recap: ["recap"] as const,
};

export function useRecap() {
  return useQuery({ queryKey: keys.recap, queryFn: () => api<WeeklyRecap>("/recap/weekly") });
}

export interface RecapItem {
  id: string;
  ownerName: string;
  commitment: string;
  category: AwaitItem["category"];
  expectedAt: string | null;
  completedAt: string | null;
  attentionState: AwaitItem["attentionState"];
}
export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  headline: string;
  counts: { resolved: number; slipped: number; created: number; followups: number; open: number; overdue: number };
  money: { owed: number; recovered: number; currency: string };
  resolved: RecapItem[];
  slipped: RecapItem[];
  owes: { ownerName: string; count: number; overdue: number; owed: number; oldestExpectedAt: string | null; items: string[] }[];
}

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
  return useNetwork().online;
}
