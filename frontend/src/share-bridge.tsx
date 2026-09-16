// Native Android/iOS share bridge (expo-share-intent). Works only in a real build; in Expo Go / web the
// native module is absent and this becomes a no-op (the Add screen still offers a simulated share).
import React, { useEffect } from "react";
import { ShareIntentProvider as RawProvider, useShareIntentContext } from "expo-share-intent";
import { openIncomingShare } from "@/src/share-intent";
import type { SharedItem } from "@/src/capture-store";

export function ShareBridgeProvider({ children }: { children: React.ReactNode }) {
  return (
    <RawProvider options={{ debug: false, resetOnBackground: true, scheme: "await" }}>
      {children}
    </RawProvider>
  );
}

/** Mount once behind the auth gate: converts a received share intent into the Share-to-Await flow. */
export function useNativeShareIntent(enabled: boolean) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!enabled || !hasShareIntent) return;
    const items: SharedItem[] = [];
    const appLabel = "Share";
    if (shareIntent.type === "weburl" && shareIntent.webUrl) {
      items.push({ kind: "url", text: shareIntent.webUrl, title: shareIntent.meta?.title ?? shareIntent.text ?? undefined, appLabel });
    } else if (shareIntent.text) {
      const isUrl = /^https?:\/\/\S+$/i.test(shareIntent.text.trim());
      items.push({ kind: isUrl ? "url" : "text", text: shareIntent.text, title: shareIntent.meta?.title ?? undefined, appLabel });
    }
    for (const f of shareIntent.files ?? []) {
      const mime = f.mimeType || "application/octet-stream";
      items.push({ kind: mime.startsWith("image/") ? "image" : "document", uri: f.path, mimeType: mime, fileName: f.fileName, appLabel });
    }
    resetShareIntent();
    if (items.length) openIncomingShare(items);
  }, [enabled, hasShareIntent, shareIntent, resetShareIntent]);
}
