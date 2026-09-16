// In-memory hand-off between capture screens (payloads are too large for URL params).
import type { Extraction, MatchResult, SourceType } from "@/src/types";

export interface SharedItem {
  kind: "text" | "image" | "document" | "url";
  text?: string;
  uri?: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
  title?: string;
  appLabel?: string;
}

export interface CapturePayload {
  sourceType: SourceType;
  items: SharedItem[];
  extraction?: Extraction | null;
  match?: MatchResult | null;
  failed?: boolean;
}

let current: CapturePayload | null = null;

export const captureStore = {
  set(p: CapturePayload) {
    current = p;
  },
  get() {
    return current;
  },
  patch(p: Partial<CapturePayload>) {
    current = { ...(current as CapturePayload), ...p };
  },
  clear() {
    current = null;
  },
};

export function itemsToEvidence(items: SharedItem[]) {
  return items.map((it) => ({
    type: it.kind === "text" ? "SHARED_TEXT" : it.kind === "url" ? "URL" : it.kind === "image" ? "SCREENSHOT" : "DOCUMENT",
    contentText: it.text ?? it.title ?? null,
    uri: it.uri ?? null,
    mimeType: it.mimeType ?? (it.kind === "text" ? "text/plain" : null),
    fileName: it.fileName ?? null,
  }));
}
