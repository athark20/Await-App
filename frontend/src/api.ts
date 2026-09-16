import { storage } from "@/src/utils/storage";
import { OfflineError, cacheGet, cacheSet, cacheable, isLocalId, mapId, markOffline, markOnline, queueCreate, queueItemMutation, setSender, type OutboxOp } from "@/src/offline";

export const TOKEN_KEY = "await.session_token";
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

let memToken: string | null = null;
let planHeader: "FREE" | "PRO" = "FREE";
let onUnauthorized: (() => void) | null = null;

export function setPlanHeader(p: "FREE" | "PRO") {
  planHeader = p;
}

export function setToken(t: string | null) {
  memToken = t;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}
export async function loadToken() {
  const t = await storage.secureGet<string | null>(TOKEN_KEY, null);
  memToken = t ?? null;
  return memToken;
}

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(typeof detail === "string" ? detail : detail?.message || detail?.code || "Request failed");
    this.status = status;
    this.detail = detail;
  }
}

async function send<T>(path: string, init: RequestInit & { json?: any } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (memToken) headers.Authorization = `Bearer ${memToken}`;
  headers["X-Plan"] = planHeader;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch {
    markOffline();
    throw new OfflineError();
  }
  markOnline();
  if (res.status === 401) {
    onUnauthorized?.();
  }
  if (!res.ok) {
    let detail: any = await res.text();
    try {
      detail = JSON.parse(detail).detail ?? detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

setSender((op: OutboxOp) => send(op.path, { method: op.method, json: op.json }));

const ITEM_MUTATION = /^\/awaits\/([^/?]+)(\/(state|snooze|reopen))?$/;

// Offline-aware client: GETs fall back to the last cached response, Await creates/edits
// are queued and applied optimistically, everything else surfaces OfflineError.
export async function api<T = any>(path: string, init: RequestInit & { json?: any } = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const mapped = mapId(path);
  const m = mapped.match(ITEM_MUTATION);
  const targetId = m?.[1];
  const localTarget = targetId && isLocalId(targetId);

  if (method === "GET" && localTarget) {
    const cached = await cacheGet(mapped);
    if (cached !== undefined) return cached as T;
  }
  if (localTarget && (method === "PATCH" || (method === "POST" && m?.[3]))) {
    // Item hasn't synced yet — keep stacking changes on the local copy.
    return queueItemMutation(targetId!, method, mapped, init.json) as any;
  }
  if (localTarget) throw new OfflineError("This Await is still syncing. Try again in a moment.");

  try {
    const data = await send<T>(mapped, init);
    if (method === "GET" && cacheable(mapped)) cacheSet(mapped, data);
    return data;
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    if (method === "GET") {
      const cached = await cacheGet(mapped);
      if (cached !== undefined) return cached as T;
      throw e;
    }
    if (method === "POST" && mapped === "/awaits") return queueCreate(init.json) as any;
    if (targetId && (method === "PATCH" || (method === "POST" && m?.[3]))) return queueItemMutation(targetId, method, mapped, init.json) as any;
    throw e;
  }
}
