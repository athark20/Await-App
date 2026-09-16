// Offline-first layer: response cache + mutation outbox + connectivity store.
// api.ts routes through here when a fetch fails at the network level.
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { queryClient } from "@/src/query-client";
import type { AwaitItem } from "@/src/types";

export class OfflineError extends Error {
  constructor(message = "You’re offline. This action needs a connection.") {
    super(message);
  }
}

export interface OutboxOp {
  id: string;
  method: string;
  path: string;
  json?: any;
  localId?: string;
  createdAt: string;
}

const OUTBOX_KEY = "await.outbox";
const CACHE_KEY = "await.cache";
const IDMAP_KEY = "await.idmap";

interface NetState {
  online: boolean;
  pending: number;
  syncing: boolean;
}

let state: NetState = { online: true, pending: 0, syncing: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<NetState>) => {
  state = { ...state, ...patch };
  emit();
};

export function useNetwork(): NetState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

// ------------------------------------------------------------------ persistence
let cache: Record<string, any> = {};
let outbox: OutboxOp[] = [];
let idMap: Record<string, string> = {};
let loaded: Promise<void> | null = null;

export function ready() {
  if (!loaded) {
    loaded = (async () => {
      const [c, o, m] = await Promise.all([
        storage.getItem<string | null>(CACHE_KEY, null),
        storage.getItem<string | null>(OUTBOX_KEY, null),
        storage.getItem<string | null>(IDMAP_KEY, null),
      ]);
      try {
        cache = c ? JSON.parse(c) : {};
        outbox = o ? JSON.parse(o) : [];
        idMap = m ? JSON.parse(m) : {};
      } catch {
        cache = {};
        outbox = [];
        idMap = {};
      }
      set({ pending: outbox.length });
    })();
  }
  return loaded;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistCache() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => storage.setItem(CACHE_KEY, JSON.stringify(cache)), 250);
}
const persistOutbox = () => storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
const persistIdMap = () => storage.setItem(IDMAP_KEY, JSON.stringify(idMap));

const CACHEABLE = ["/awaits", "/stats", "/summary", "/recap", "/auth/me"];
export function cacheable(path: string) {
  return CACHEABLE.some((p) => path.startsWith(p));
}

export async function cacheSet(path: string, data: any) {
  await ready();
  cache[path] = data;
  persistCache();
}

export async function cacheGet(path: string) {
  await ready();
  return cache[path];
}

export function mapId(path: string) {
  return path.replace(/local_[a-z0-9]+/g, (m) => idMap[m] ?? m);
}

export function isLocalId(id: string) {
  return id.startsWith("local_");
}

// ------------------------------------------------------------------ offline mutations
function listKeys() {
  return Object.keys(cache).filter((k) => k === "/awaits" || k.startsWith("/awaits?"));
}

function updateLists(fn: (list: AwaitItem[]) => AwaitItem[]) {
  for (const k of listKeys()) if (Array.isArray(cache[k])) cache[k] = fn(cache[k]);
}

export async function queueCreate(body: any): Promise<AwaitItem> {
  await ready();
  const nowIso = new Date().toISOString();
  const localId = `local_${Math.random().toString(36).slice(2, 12)}`;
  const item: AwaitItem = {
    id: localId,
    title: body.title ?? body.commitment,
    ownerName: body.ownerName,
    commitment: body.commitment,
    expectedAt: body.expectedAt ?? null,
    expectedText: body.expectedText ?? null,
    expectedDateOnly: body.expectedDateOnly ?? true,
    state: body.state ?? "THEIR_TURN",
    attentionState: "NORMAL",
    category: body.category ?? "OTHER",
    notes: body.notes ?? "",
    sourceType: body.sourceType ?? "MANUAL",
    sourceAppLabel: body.sourceAppLabel ?? null,
    sourceEvidenceIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    lastReminderAt: null,
    nextReminderAt: null,
    reminderCount: 0,
    ignoredReminderCount: 0,
    lastFollowupAt: null,
    nextCheckAt: null,
    resolutionConfidence: null,
    resolutionEvidenceId: null,
    amount: body.amount ?? null,
    currency: body.currency ?? "INR",
    pending: true,
  };
  cache[`/awaits/${localId}`] = item;
  cache[`/awaits/${localId}/events`] = [{ id: `${localId}_ev`, type: "CREATED", text: "Saved offline — will sync when you’re back online", createdAt: nowIso }];
  cache[`/awaits/${localId}/evidence`] = [];
  updateLists((l) => [item, ...l]);
  persistCache();
  outbox.push({ id: `op_${Date.now()}`, method: "POST", path: "/awaits", json: body, localId, createdAt: nowIso });
  await persistOutbox();
  set({ pending: outbox.length });
  return item;
}

export async function queueItemMutation(id: string, method: string, path: string, json: any): Promise<AwaitItem> {
  await ready();
  const current: AwaitItem | undefined = cache[`/awaits/${id}`] ?? listKeys().flatMap((k) => cache[k] as AwaitItem[]).find((x) => x?.id === id);
  if (!current) throw new OfflineError();
  const nowIso = new Date().toISOString();
  let next: AwaitItem = { ...current, updatedAt: nowIso, pending: true };
  if (method === "PATCH") next = { ...next, ...json };
  else if (path.endsWith("/state")) next = { ...next, state: json.state, completedAt: json.state === "DONE" ? nowIso : null };
  else if (path.endsWith("/reopen")) next = { ...next, state: json.state, completedAt: null };
  else if (path.endsWith("/snooze")) {
    const until = json.until ?? new Date(Date.now() + (json.days ?? 1) * 86400000).toISOString();
    next = { ...next, nextReminderAt: until, attentionState: "NORMAL", ignoredReminderCount: 0 };
  }
  cache[`/awaits/${id}`] = next;
  updateLists((l) => l.map((x) => (x.id === id ? next : x)));
  persistCache();
  outbox.push({ id: `op_${Date.now()}`, method, path, json, createdAt: nowIso });
  await persistOutbox();
  set({ pending: outbox.length });
  return next;
}

// ------------------------------------------------------------------ sync
type Sender = (op: OutboxOp) => Promise<any>;
let sender: Sender | null = null;
export function setSender(fn: Sender) {
  sender = fn;
}

export async function syncOutbox() {
  await ready();
  if (!sender || state.syncing || outbox.length === 0) return;
  set({ syncing: true });
  try {
    while (outbox.length) {
      const op = outbox[0];
      try {
        const res = await sender({ ...op, path: mapId(op.path) });
        if (op.localId && res?.id) {
          idMap[op.localId] = res.id;
          await persistIdMap();
          delete cache[`/awaits/${op.localId}`];
          delete cache[`/awaits/${op.localId}/events`];
          delete cache[`/awaits/${op.localId}/evidence`];
          updateLists((l) => l.map((x) => (x.id === op.localId ? { ...res, pending: false } : x)));
          persistCache();
        }
      } catch (e: any) {
        if (e instanceof OfflineError) break; // still offline — retry later
        // Server rejected it (e.g. Free limit) — drop so the queue can't wedge.
        if (op.localId) {
          delete cache[`/awaits/${op.localId}`];
          updateLists((l) => l.filter((x) => x.id !== op.localId));
          persistCache();
        }
      }
      outbox.shift();
      await persistOutbox();
      set({ pending: outbox.length });
    }
  } finally {
    set({ syncing: false });
    queryClient.invalidateQueries();
  }
}

// ------------------------------------------------------------------ connectivity
export function markOnline() {
  if (!state.online) {
    set({ online: true });
    syncOutbox().catch(() => {});
  }
}
export function markOffline() {
  if (state.online) set({ online: false });
}

let monitorStarted = false;
export function startNetworkMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  const check = async () => {
    try {
      const r = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/health`);
      if (r.ok) markOnline();
      else markOffline();
    } catch {
      markOffline();
    }
    if (state.online && outbox.length) syncOutbox().catch(() => {});
  };
  ready().then(check);
  setInterval(check, 15000);
  if (Platform.OS !== "web") AppState.addEventListener("change", (s) => s === "active" && check());
}
