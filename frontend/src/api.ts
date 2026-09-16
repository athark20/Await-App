import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "await.session_token";
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

let memToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

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

export async function api<T = any>(path: string, init: RequestInit & { json?: any } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (memToken) headers.Authorization = `Bearer ${memToken}`;
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
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
