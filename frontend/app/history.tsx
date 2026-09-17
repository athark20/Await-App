import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing, useTheme } from "@/src/theme";
import { ScreenHeader, EmptyState } from "@/src/components/ui";
import { AwaitCard } from "@/src/components/AwaitCard";
import { useAwaits } from "@/src/hooks";
import { useSubscription } from "@/src/revenuecat";

export default function History() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isSubscribed } = useSubscription();
  const q = useAwaits({ state: "DONE", sort: "recent" });
  const items = q.data ?? [];
  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="history-screen">
      <ScreenHeader title="History" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.sub}>{isSubscribed ? "All completed Awaits." : "Completed Awaits from the last 30 days. Upgrade to Pro for unlimited history."}</Text>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 32 }} /> : null}
        {!q.isLoading && items.length === 0 ? <EmptyState testID="history-empty" icon="time-outline" tone="neutral" title="No completed Awaits yet" subtitle="Items you mark as Done will appear here." /> : null}
        {items.map((it) => <AwaitCard key={it.id} item={it} showClosed />)}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.xl, gap: 10 },
  sub: { color: c.muted, fontSize: 13.5, marginBottom: 4 },
}));
