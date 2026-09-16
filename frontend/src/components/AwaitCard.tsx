import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Icon, IconBox, Pill } from "@/src/components/ui";
import { amountLabel, dueLabel, expectedLine } from "@/src/format";
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
  const { colors } = useTheme();
  const due = dueLabel(item);
  const sub = item.state === "DONE" && showClosed && item.completedAt ? `Closed ${new Date(item.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : expectedLine(item);
  const turn = item.state === "MY_TURN" ? "My turn" : item.state === "THEIR_TURN" ? "Their turn" : null;
  return (
    <Pressable
      testID={`await-card-${item.id}`}
      onPress={onPress ?? (() => router.push(`/item/${item.id}`))}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <IconBox letter={item.ownerName.charAt(0).toUpperCase()} tone={CATEGORY_TONE[item.category] ?? "neutral"} size={44} />
      <View style={styles.body}>
        <Text style={styles.owner} numberOfLines={1}>
          {item.ownerName}
        </Text>
        <Text style={styles.what} numberOfLines={1}>
          {item.commitment}
          {amountLabel(item) ? <Text style={styles.amount}>  {amountLabel(item)}</Text> : null}
        </Text>
        <View style={styles.metaRow}>
          <Icon name="calendar-outline" size={12} color={colors.muted} />
          <Text style={[styles.sub, { flexShrink: 1 }]} numberOfLines={1}>{sub}</Text>
          {turn ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Icon name={item.state === "MY_TURN" ? "person-outline" : "people-outline"} size={12} color={colors.muted} />
              <Text style={[styles.sub, { flexShrink: 0 }]} numberOfLines={1}>{turn}</Text>
            </>
          ) : null}
          {item.pending ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Icon name="cloud-upload-outline" size={12} color={colors.warning} />
              <Text style={[styles.sub, { color: colors.warning, flexShrink: 0 }]} numberOfLines={1} testID={`await-card-pending-${item.id}`}>Syncing</Text>
            </>
          ) : null}
        </View>
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
  amount: { fontWeight: "800", color: c.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, overflow: "hidden" },
  sub: { fontSize: 12, color: c.muted },
  dot: { fontSize: 12, color: c.muted, marginHorizontal: 2 },
}));
