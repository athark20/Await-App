// Incoming share handling. In a native Android build, ACTION_SEND / ACTION_SEND_MULTIPLE intents are
// declared in app.json and delivered via the `await://share` deep link (a native share-intent module
// forwards EXTRA_TEXT / EXTRA_STREAM here). In Expo Go / web the same route is reachable via the
// "Simulate incoming share" entry on the Add screen so the full flow is testable.
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { captureStore, type SharedItem } from "@/src/capture-store";

export function openIncomingShare(items: SharedItem[]) {
  const kinds = new Set(items.map((i) => i.kind));
  const sourceType =
    items.length && kinds.size === 1
      ? items[0].kind === "text"
        ? "SHARED_TEXT"
        : items[0].kind === "url"
          ? "URL"
          : items[0].kind === "image"
            ? "SCREENSHOT"
            : "DOCUMENT"
      : "SHARED_TEXT";
  captureStore.set({ sourceType, items });
  router.push("/capture/share");
}

export function handleIncomingUrl(url: string) {
  const parsed = Linking.parse(url);
  if (parsed.path === "share" || parsed.hostname === "share") {
    const q = parsed.queryParams ?? {};
    const items: SharedItem[] = [];
    if (typeof q.text === "string" && q.text) {
      const isUrl = /^https?:\/\//i.test(q.text.trim());
      items.push({ kind: isUrl ? "url" : "text", text: q.text, title: typeof q.subject === "string" ? q.subject : undefined });
    }
    if (typeof q.uri === "string" && q.uri) {
      const mime = typeof q.mime === "string" ? q.mime : "application/octet-stream";
      items.push({ kind: mime.startsWith("image/") ? "image" : "document", uri: q.uri, mimeType: mime, fileName: typeof q.name === "string" ? q.name : undefined });
    }
    if (items.length) {
      openIncomingShare(items);
      return true;
    }
  }
  if (parsed.path?.startsWith("item/")) {
    router.push(`/${parsed.path}` as any);
    return true;
  }
  return false;
}
