import React, { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, spacing } from "@/src/theme";
import { Group, ListRow, ScreenHeader, Field } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { useToast } from "@/src/components/Toast";

const FAQS = [
  ["What is an Await?", "Something you’re waiting on from someone else — a refund, a reply, a delivery, a document. Await remembers it and reminds you when it matters."],
  ["How does Share to Await work?", "From any app, tap Share → Await. You’ll see a preview, Await suggests who/what/when, and nothing is saved until you confirm."],
  ["Does Await read my inbox?", "No. Await only sees content you intentionally share. No WhatsApp, Gmail, SMS or notification access."],
  ["What does Needs Review mean?", "After repeated ignored reminders, Await stops pinging and parks the item for a calm review."],
];

export default function Help() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "faq" | "problem" | "feedback">(null);
  const [text, setText] = useState("");

  const send = () => {
    setSheet(null);
    setText("");
    toast.show("Thanks — we’ve received it", "success");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="help-screen">
      <ScreenHeader title="Help & Support" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Group>
          <ListRow testID="help-faq-row" icon="help-circle-outline" title="FAQs" subtitle="Find quick answers" onPress={() => setSheet("faq")} />
          <ListRow testID="help-contact-row" icon="mail-outline" tone="success" title="Contact Us" subtitle="support@await.app" onPress={() => Linking.openURL("mailto:support@await.app?subject=Await%20support")} />
          <ListRow testID="help-problem-row" icon="warning-outline" tone="error" title="Report a Problem" subtitle="Tell us what went wrong" onPress={() => setSheet("problem")} />
          <ListRow testID="help-feedback-row" icon="chatbox-ellipses-outline" tone="warning" title="Give Feedback" subtitle="Help us improve" onPress={() => setSheet("feedback")} last />
        </Group>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Need immediate help?</Text>
          <Text style={styles.cardSub}>Our support team usually replies within a few hours.</Text>
        </View>
        <Text style={styles.version}>Await · Version 1.0.0</Text>
      </ScrollView>

      <Sheet visible={sheet === "faq"} onClose={() => setSheet(null)} title="FAQs" testID="faq-sheet" secondary={{ title: "Close", onPress: () => setSheet(null) }}>
        <View style={{ gap: 12, marginTop: 12 }}>
          {FAQS.map(([q, a]) => (
            <View key={q}>
              <Text style={styles.q}>{q}</Text>
              <Text style={styles.a}>{a}</Text>
            </View>
          ))}
        </View>
      </Sheet>
      <Sheet visible={sheet === "problem" || sheet === "feedback"} onClose={() => setSheet(null)} icon={sheet === "problem" ? "warning-outline" : "chatbox-ellipses-outline"} tone={sheet === "problem" ? "error" : "warning"} title={sheet === "problem" ? "Report a Problem" : "Give Feedback"} primary={{ title: "Send", onPress: send }} testID="support-sheet">
        <View style={{ marginTop: 12 }}>
          <Field placeholder={sheet === "problem" ? "What went wrong?" : "What would make Await better?"} value={text} onChangeText={setText} multiline testID="support-input" />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.xl, gap: 12 },
  card: { backgroundColor: c.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  cardSub: { fontSize: 13.5, color: c.muted },
  version: { textAlign: "center", color: c.muted, fontSize: 12, marginTop: 8 },
  q: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  a: { fontSize: 13.5, color: c.muted, lineHeight: 19, marginTop: 2 },
}));
