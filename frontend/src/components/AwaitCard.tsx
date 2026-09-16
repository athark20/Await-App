import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { makeStyles, radius, spacing } from "@/src/theme";
import { IconBox, Pill } from "@/src/components/ui";
import { dueLabel, expectedLine } from "@/src/format";
import type { AwaitItem, Category } from "@/src/types";
import type { PillTone } from "@/src/format";

export const CATEGORY_TONE: Record<Category, PillTone> = {
  REFUND: "error",
  DELIVERY: "warning",
  DOCUMENT: "brand",
  APPOINTMENT: "purple",
  PAYMENT: "success",
  OTHER: "neutral",
};

export function AwaitCard({ item, onPress, showClosed }: { item: AwaitItem; onPress?: () => void; showClosed?: boolean }) {
  const styles = useStyles();
  const router = useRouter();
  const due = dueLabel(item);
  const sub = item.state === "DONE" && showClosed && item.completedAt ? `Closed ${new Date(item.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : expectedLine(item);
  return (
    <Pressable
      testID={`await-card-${item.id}`}
      onPress={onPress ?? (() => router.push(`/item/${item.id}`))}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <IconBox letter={item.ownerName.charAt(0).toUpperCase()} tone={CATEGORY_TONE[item.category] ?? "neutral"} size={40} />
      <View style={styles.body}>
        <Text style={styles.owner} numberOfLines={1}>
          {item.ownerName}
        </Text>
        <Text style={styles.what} numberOfLines={1}>
          {item.commitment}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Pill text={due.text} tone={due.tone} testID={`await-card-pill-${item.id}`} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
    paddingRight: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  body: { flex: 1, gap: 1 },
  owner: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  what: { fontSize: 13.5, color: c.onSurfaceSecondary },
  sub: { fontSize: 12, color: c.muted, marginTop: 1 },
}));
