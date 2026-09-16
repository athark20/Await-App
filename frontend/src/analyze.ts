import { router } from "expo-router";
import { File } from "expo-file-system";
import { api } from "@/src/api";
import { captureStore, type SharedItem } from "@/src/capture-store";
import type { ExtractResponse } from "@/src/types";

export const AI_READABLE_DOCS = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const BINARY_DOCS = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

export function isAiReadable(item: SharedItem) {
  if (item.kind !== "document") return true;
  return !!item.mimeType && (AI_READABLE_DOCS.includes(item.mimeType) || item.mimeType.startsWith("text/"));
}

async function fileBase64(uri: string) {
  const f = new File(uri);
  return f.base64();
}

async function fileText(uri: string) {
  const f = new File(uri);
  return f.text();
}

/** Runs AI extraction + existing-Await matching for the current capture payload, then routes. */
export async function analyzeCurrent(items?: SharedItem[]) {
  const p = captureStore.get();
  if (!p) throw new Error("Nothing to analyze");
  const list = items ?? p.items;
  const texts: string[] = [];
  let image_base64: string | undefined;
  let mime_type: string | undefined;
  let file_name: string | undefined;
  let url: string | undefined;
  for (const it of list) {
    if (it.kind === "text" && it.text) texts.push(it.text);
    if (it.kind === "url") {
      url = it.text;
      if (it.title) texts.push(it.title);
    }
    if (it.kind === "image" && !image_base64) {
      image_base64 = it.base64 ?? (it.uri ? await fileBase64(it.uri) : undefined);
      mime_type = it.mimeType ?? "image/jpeg";
      file_name = it.fileName;
    }
    if (it.kind === "document" && it.uri) {
      file_name = it.fileName;
      mime_type = it.mimeType;
      if (it.mimeType && BINARY_DOCS.includes(it.mimeType)) image_base64 = image_base64 ?? (await fileBase64(it.uri));
      else if (it.mimeType?.startsWith("text/")) texts.push(await fileText(it.uri));
    }
  }
  const res = await api<ExtractResponse>("/ai/extract", {
    method: "POST",
    json: { text: texts.join("\n\n") || undefined, image_base64, mime_type, file_name, url, source_type: p.sourceType },
  });
  captureStore.patch({ extraction: res.extraction, match: res.match, failed: !res.ok });
  const rel = res.match?.relationshipConfidence ?? 0;
  if (res.match && rel >= 0.65) router.replace("/capture/match");
  else router.replace("/capture/confirm");
  return res;
}
