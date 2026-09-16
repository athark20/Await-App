import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Sheet } from "@/src/components/Sheet";
import { Banner, Button } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";
import { useOnline } from "@/src/hooks";

export function FreeLimitSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="star"
      tone="warning"
      title="Free Limit Reached"
      subtitle={"You’ve reached your free limit.\nYou’re tracking 10 active Awaits."}
      primary={{
        title: "Upgrade to Pro",
        onPress: () => {
          onClose();
          router.push("/settings/upgrade");
        },
      }}
      secondary={{ title: "Maybe Later", onPress: onClose }}
      testID="free-limit-sheet"
    />
  );
}

export function useFreeLimit() {
  const [visible, setVisible] = useState(false);
  const handle = (e: any) => {
    if (e?.status === 402 && e?.detail?.code === "FREE_LIMIT") {
      setVisible(true);
      return true;
    }
    return false;
  };
  return { visible, close: () => setVisible(false), handle };
}

export function OfflineBanner() {
  const online = useOnline();
  const styles = useStyles();
  if (online) return null;
  return (
    <View style={styles.wrap}>
      <Banner icon="cloud-offline-outline" tone="warning" text="You’re offline. Saved items are still available." testID="offline-banner" />
    </View>
  );
}

export function ErrorRetry({ onRetry, message = "Couldn’t load. Check your connection." }: { onRetry: () => void; message?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.err}>
      <Text style={styles.errText}>{message}</Text>
      <Button title="Retry" small variant="secondary" onPress={onRetry} testID="retry-button" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { paddingHorizontal: 20, paddingBottom: 8 },
  err: { alignItems: "center", gap: 12, padding: 24 },
  errText: { color: c.muted, textAlign: "center" },
}));
