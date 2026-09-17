import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Chips, Field, Icon, ScreenHeader, StateSelector } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/api";
import { CURRENCIES, currencySymbol } from "@/src/format";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/src/types";
import { scheduleLabel, type Template } from "@/app/templates";

type Every = Template["every"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TemplateEdit() {
  const params = useLocalSearchParams<{ id?: string; who?: string; what?: string; category?: string; amount?: string; currency?: string; state?: string; notes?: string }>();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const editing = !!params.id;
  const existing = useQuery({ queryKey: ["templates"], queryFn: () => api<Template[]>("/templates"), enabled: editing });

  const [title, setTitle] = useState("");
  const [who, setWho] = useState(params.who ?? "");
  const [what, setWhat] = useState(params.what ?? "");
  const [category, setCategory] = useState<Category>((params.category as Category) ?? "OTHER");
  const [state, setState] = useState<"MY_TURN" | "THEIR_TURN">((params.state as any) === "MY_TURN" ? "MY_TURN" : "THEIR_TURN");
  const [amount, setAmount] = useState(params.amount ?? "");
  const [currency, setCurrency] = useState(params.currency ?? "INR");
  const [notes, setNotes] = useState(params.notes ?? "");
  const [every, setEvery] = useState<Every>("month");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [weekday, setWeekday] = useState(0);
  const [after, setAfter] = useState("7");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = existing.data?.find((x) => x.id === params.id);
    if (!t) return;
    setTitle(t.title); setWho(t.ownerName); setWhat(t.commitment); setCategory(t.category); setState(t.state);
    setAmount(t.amount ? String(t.amount) : ""); setCurrency(t.currency); setNotes(t.notes ?? "");
    setEvery(t.every); setDayOfMonth(t.dayOfMonth); setWeekday(t.weekday); setAfter(String(t.expectedAfterDays));
  }, [existing.data, params.id]);

  const save = async () => {
    setError(null);
    if (!who.trim() || !what.trim()) return setError("Who and What are required.");
    const n = parseFloat(amount);
    const body = {
      title: title.trim() || `${what.trim()} · ${who.trim()}`,
      ownerName: who.trim(), commitment: what.trim(), category, state, notes,
      amount: Number.isFinite(n) && n > 0 ? n : null, currency,
      every, dayOfMonth, weekday, expectedAfterDays: Math.max(0, parseInt(after || "0", 10) || 0),
    };
    setBusy(true);
    try {
      if (editing) await api(`/templates/${params.id}`, { method: "PATCH", json: body });
      else await api("/templates", { method: "POST", json: body });
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.show(editing ? "Template updated" : "Recurring Await saved", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/templates");
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await api(`/templates/${params.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["templates"] });
    setDel(false);
    toast.show("Template deleted", "success");
    router.replace("/templates");
  };

  const preview = { every, dayOfMonth, weekday };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="template-edit-screen">
      <ScreenHeader
        title={editing ? "Edit Recurring Await" : "New Recurring Await"}
        right={editing ? (
          <Pressable testID="template-delete-button" onPress={() => setDel(true)} style={styles.iconBtn} hitSlop={8}>
            <Icon name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        ) : undefined}
      />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Field label="Template name" placeholder="e.g. Monthly rent receipt" value={title} onChangeText={setTitle} testID="template-title-input" />
        <Field label="Who" placeholder="e.g. Landlord, Payroll, Accountant" value={who} onChangeText={setWho} testID="template-who-input" />
        <Field label="What" placeholder="e.g. Send rent receipt" value={what} onChangeText={setWhat} testID="template-what-input" />
        <View style={styles.amountRow}>
          <Pressable testID="template-currency-button" onPress={() => setCurrency(CURRENCIES[(CURRENCIES.indexOf(currency) + 1) % CURRENCIES.length])} style={styles.curBtn}>
            <Text style={styles.cur}>{currencySymbol(currency)}</Text>
          </Pressable>
          <Field label="Amount (optional)" placeholder="e.g. 25000" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" testID="template-amount-input" style={{ flex: 1 }} />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Category</Text>
          <Chips<Category> testID="template-category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c] }))} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Who has the next step</Text>
          <StateSelector value={state} onChange={(s) => s !== "DONE" && setState(s)} includeDone={false} testID="template-state" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Schedule</Text>
          <Chips<Every> testID="template-every" value={every} onChange={setEvery} options={[{ key: "week", label: "Weekly" }, { key: "month", label: "Monthly" }, { key: "quarter", label: "Quarterly" }, { key: "year", label: "Yearly" }]} />
          {every === "week" ? (
            <View style={styles.dayRow}>
              {WEEKDAYS.map((d, i) => (
                <Pressable key={d} testID={`template-weekday-${i}`} onPress={() => setWeekday(i)} style={[styles.day, weekday === i && styles.daySel]}>
                  <Text style={[styles.dayText, weekday === i && { color: colors.onBrandPrimary }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.dayRow}>
              {[1, 5, 10, 15, 20, 25, 28].map((d) => (
                <Pressable key={d} testID={`template-dom-${d}`} onPress={() => setDayOfMonth(d)} style={[styles.day, dayOfMonth === d && styles.daySel]}>
                  <Text style={[styles.dayText, dayOfMonth === d && { color: colors.onBrandPrimary }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Field label="Expected within (days after it's created)" placeholder="7" value={after} onChangeText={(t) => setAfter(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" testID="template-after-input" />
          <View style={styles.preview}>
            <Icon name="repeat-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.previewText}>{scheduleLabel(preview)} · each one expected within {after || "0"} days</Text>
          </View>
        </View>

        <Field label="Notes (optional)" placeholder="Anything to remember each time" value={notes} onChangeText={setNotes} multiline testID="template-notes-input" />
        {error ? <Text style={styles.error} testID="template-error">{error}</Text> : null}
        <Button title={editing ? "Save changes" : "Save recurring Await"} icon="checkmark" onPress={save} loading={busy} testID="template-save-button" />
      </KeyboardAwareScrollView>
      <Sheet visible={del} onClose={() => setDel(false)} icon="trash-outline" tone="error" title="Delete this template?" subtitle="Awaits it already created stay as they are." primary={{ title: "Delete template", variant: "danger", onPress: remove }} secondary={{ title: "Cancel", onPress: () => setDel(false) }} testID="template-delete-sheet" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: spacing.lg, gap: 16, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
  amountRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  curBtn: { width: 50, height: 50, marginTop: 25, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  cur: { fontSize: 18, fontWeight: "800", color: c.brandPrimary },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, gap: 12 },
  cardTitle: { fontSize: 15.5, fontWeight: "800", color: c.onSurface },
  dayRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  day: { minWidth: 40, height: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  daySel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  dayText: { fontSize: 13, fontWeight: "700", color: c.onSurface },
  preview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.brandTertiary, borderRadius: radius.sm, padding: 10 },
  previewText: { flex: 1, fontSize: 13, color: c.onSurface, fontWeight: "600" },
  error: { color: c.error, fontSize: 13.5 },
}));
