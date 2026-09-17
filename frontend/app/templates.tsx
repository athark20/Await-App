import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { EmptyState, Icon, IconBox, Pill, ScreenHeader } from "@/src/components/ui";
import { ErrorRetry } from "@/src/components/common";
import { useToast } from "@/src/components/Toast";
import { useInvalidateAwaits } from "@/src/hooks";
import { api } from "@/src/api";
import { amountLabel, categoryIcon } from "@/src/format";
import type { Category } from "@/src/types";

export interface Template {
  id: string;
  title: string;
  ownerName: string;
  commitment: string;
  category: Category;
  state: "MY_TURN" | "THEIR_TURN";
  notes: string;
  amount: number | null;
  currency: string;
  every: "week" | "month" | "quarter" | "year";
  dayOfMonth: number;
  weekday: number;
  expectedAfterDays: number;
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  runs: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function scheduleLabel(t: Pick<Template, "every" | "dayOfMonth" | "weekday">) {
  if (t.every === "week") return `Every ${WEEKDAYS[t.weekday] ?? "Mon"}`;
  const d = t.dayOfMonth;
  const suffix = d === 1 || d === 21 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
  return `${t.every === "month" ? "Monthly" : t.every === "quarter" ? "Quarterly" : "Yearly"} on the ${d}${suffix}`;
}

export default function Templates() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateAwaits();
  const q = useQuery({ queryKey: ["templates"], queryFn: () => api<Template[]>("/templates") });
  const rows = q.data ?? [];

  const toggle = useMutation({
    mutationFn: (t: Template) => api(`/templates/${t.id}`, { method: "PATCH", json: { active: !t.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
  const runNow = useMutation({
    mutationFn: (t: Template) => api<{ id: string }>(`/templates/${t.id}/run`, { method: "POST" }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      invalidate();
      toast.show("Await created from template", "success");
      router.push(`/item/${created.id}`);
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not create", "error"),
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="templates-screen">
      <ScreenHeader
        title="Recurring Awaits"
        right={
          <Pressable testID="templates-add-button" onPress={() => router.push("/template-edit")} style={styles.iconBtn} hitSlop={8}>
            <Icon name="add" size={24} color={colors.brandPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.intro}>Templates recreate themselves on a schedule, like a monthly rent receipt or a quarterly report, so you never have to add them again.</Text>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} /> : null}
        {q.isError ? <ErrorRetry onRetry={q.refetch} /> : null}
        {!q.isLoading && rows.length === 0 ? (
          <EmptyState testID="templates-empty" icon="repeat-outline" title="No recurring Awaits yet" subtitle="Save something you wait for every month or week and Await will create it for you on schedule." cta="Create a template" onCta={() => router.push("/template-edit")} />
        ) : null}
        {rows.map((t) => (
          <Pressable key={t.id} testID={`template-${t.id}`} onPress={() => router.push({ pathname: "/template-edit", params: { id: t.id } })} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }, !t.active && { opacity: 0.6 }]}>
            <View style={styles.row}>
              <IconBox name={categoryIcon(t.category)} size={44} tone={t.active ? "brand" : "neutral"} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {t.ownerName} · {t.commitment}{amountLabel(t) ? ` · ${amountLabel(t)}` : ""}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {scheduleLabel(t)} · {t.active ? `next ${dayjs(t.nextRunAt).format("D MMM")}` : "paused"}{t.runs ? ` · ${t.runs} created` : ""}
                </Text>
              </View>
              <Pill text={t.active ? "Active" : "Paused"} tone={t.active ? "success" : "neutral"} testID={`template-status-${t.id}`} />
            </View>
            <View style={styles.actions}>
              <Pressable testID={`template-run-${t.id}`} onPress={() => runNow.mutate(t)} style={styles.actionBtn} disabled={runNow.isPending}>
                <Icon name="play-outline" size={16} color={colors.brandPrimary} />
                <Text style={styles.actionText}>Create now</Text>
              </Pressable>
              <Pressable testID={`template-toggle-${t.id}`} onPress={() => toggle.mutate(t)} style={styles.actionBtn}>
                <Icon name={t.active ? "pause-outline" : "play-circle-outline"} size={16} color={colors.brandPrimary} />
                <Text style={styles.actionText}>{t.active ? "Pause" : "Resume"}</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.lg, gap: 10, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  intro: { fontSize: 13.5, color: c.muted, lineHeight: 19, marginBottom: 4 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 12.5, color: c.muted },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, height: 38, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { fontSize: 13, fontWeight: "700", color: c.brandPrimary },
}));
