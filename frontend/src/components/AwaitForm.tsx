import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { makeStyles, radius, useTheme } from "@/src/theme";
import { Field, Icon, StateSelector } from "@/src/components/ui";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/src/types";
import { parseExpectedPhrase } from "@/src/dates";
import { CURRENCIES, currencySymbol, money } from "@/src/format";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";

export interface AwaitFormValue {
  who: string;
  what: string;
  expectedAt: string | null; // ISO
  expectedText: string;
  category: Category;
  state: "MY_TURN" | "THEIR_TURN";
  notes: string;
  amount: string; // raw digits typed by the user; "" = no amount
  currency: string;
  reminderLeadDays: number; // >0 = remind this many days before the promised date
}

export function emptyForm(): AwaitFormValue {
  return { who: "", what: "", expectedAt: null, expectedText: "", category: "OTHER", state: "THEIR_TURN", notes: "", amount: "", currency: "INR", reminderLeadDays: 0 };
}

/** Body fields for POST/PATCH /awaits derived from the form's amount + currency. */
export function amountPayload(v: AwaitFormValue) {
  const n = parseFloat(v.amount.replace(/[^0-9.]/g, ""));
  return { amount: Number.isFinite(n) && n > 0 ? n : null, currency: v.currency || "INR", reminderLeadDays: v.reminderLeadDays || 0 };
}

type OwnerRow = { ownerName: string; key: string; open: number; overdue: number; done: number; onTimeRate: number | null; avgDaysLate: number };

/** Owner Reliability Alert: warn when "who" matches someone with a poor track record and offer a tighter reminder. */
function ReliabilityAlert({ who, lead, onLead }: { who: string; lead: number; onLead: (d: number) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const owners = useQuery({ queryKey: ["owners"], queryFn: () => api<OwnerRow[]>("/owners"), staleTime: 60_000 });
  const autoRef = useRef<string | null>(null);
  const key = who.trim().toLowerCase().replace(/\s+/g, " ");
  const o = key.length >= 2 ? owners.data?.find((r) => r.key === key) : undefined;
  const often = !!o && ((o.onTimeRate !== null && o.onTimeRate < 0.5) || o.overdue > 0);
  const suggested = o ? Math.min(7, Math.max(2, Math.round(o.avgDaysLate || 2))) : 0;
  // Suggest the tighter reminder by default (once per matched owner); the user can still pick "Remind on the date".
  useEffect(() => {
    if (o && often && lead === 0 && autoRef.current !== o.key) {
      autoRef.current = o.key;
      onLead(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o?.key, often]);
  if (!o || !often) return null;
  const detail = o.onTimeRate !== null && o.onTimeRate < 0.5 ? `on time only ${Math.round(o.onTimeRate * 100)}% of the time${o.avgDaysLate ? `, ${o.avgDaysLate} days late on average` : ""}` : `${o.overdue} item${o.overdue === 1 ? "" : "s"} already overdue with you`;
  return (
    <View style={styles.alert} testID="form-reliability-alert">
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Icon name="warning-outline" size={18} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text style={styles.alertTitle}>{o.ownerName} is often late</Text>
          <Text style={styles.alertText}>They’ve been {detail}. A nudge before the date gives you time to chase.</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {[0, suggested, suggested + 3].filter((d, i, a) => a.indexOf(d) === i).map((d) => (
          <Pressable key={d} testID={`form-lead-${d}`} onPress={() => onLead(d)} style={[styles.leadChip, lead === d && styles.leadChipSel]}>
            <Text style={[styles.leadText, lead === d && { color: colors.onBrandPrimary }]}>{d === 0 ? "Remind on the date" : `${d} days early`}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function nextWeekday(day: number) {
  let d = dayjs().startOf("day");
  while (d.day() !== day || d.isSame(dayjs().startOf("day"))) d = d.add(1, "day");
  return d;
}

export function AwaitForm({ value, onChange, showNotes = true, showState = true, source }: { value: AwaitFormValue; onChange: (v: AwaitFormValue) => void; showNotes?: boolean; showState?: boolean; source?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const set = (p: Partial<AwaitFormValue>) => onChange({ ...value, ...p });
  const [typed, setTyped] = useState(value.expectedAt ? dayjs(value.expectedAt).format("DD/MM/YYYY") : value.expectedText || "");
  const [showPicker, setShowPicker] = useState(false);

  const quick: [string, () => dayjs.Dayjs][] = [
    ["Today", () => dayjs().startOf("day")],
    ["Tomorrow", () => dayjs().add(1, "day").startOf("day")],
    ["Friday", () => nextWeekday(5)],
    ["Monday", () => nextWeekday(1)],
    ["In 3 days", () => dayjs().add(3, "day").startOf("day")],
    ["Next week", () => dayjs().add(7, "day").startOf("day")],
  ];

  const pick = (label: string, d: dayjs.Dayjs) => {
    const iso = d.hour(18).toISOString();
    setTyped(d.format("DD/MM/YYYY"));
    set({ expectedAt: iso, expectedText: label });
  };

  const onTyped = (t: string) => {
    setTyped(t);
    if (!t.trim()) return set({ expectedAt: null, expectedText: "" });
    const d = parseExpectedPhrase(t);
    if (d) set({ expectedAt: d.toISOString(), expectedText: t.trim() });
    else set({ expectedText: t.trim() });
  };

  const onPicked = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === "android") setShowPicker(false);
    if (e.type === "dismissed" || !d) return;
    const day = dayjs(d).startOf("day").hour(18);
    setTyped(day.format("DD/MM/YYYY"));
    set({ expectedAt: day.toISOString(), expectedText: day.format("D MMM YYYY") });
  };

  const parsedHint = value.expectedAt
    ? `Expected ${dayjs(value.expectedAt).format("ddd, D MMM YYYY")}${value.expectedText && !/^\d/.test(value.expectedText) ? ` · from “${value.expectedText}”` : ""}`
    : value.expectedText
      ? `Couldn’t read “${value.expectedText}” — pick a date`
      : "Type a date or phrase (e.g. “within 7–10 business days”, “by Friday”)";

  return (
    <View style={{ gap: 16 }}>
      <Field label="Who" placeholder="e.g. Amazon, Sameer" value={value.who} onChangeText={(who) => set({ who })} testID="form-who-input" />
      <ReliabilityAlert who={value.who} lead={value.reminderLeadDays} onLead={(d) => set({ reminderLeadDays: d })} />
      <Field label="What" placeholder="e.g. Refund ₹3,499, Send quotation" value={value.what} onChangeText={(what) => set({ what })} testID="form-what-input" />
      <View style={styles.dateRow}>
        <Pressable testID="form-currency-button" onPress={() => set({ currency: CURRENCIES[(CURRENCIES.indexOf(value.currency) + 1) % CURRENCIES.length] })} style={styles.calBtn}>
          <Text style={styles.currency}>{currencySymbol(value.currency)}</Text>
        </Pressable>
        <Field
          label="Amount (optional)"
          placeholder="e.g. 3499"
          value={value.amount}
          onChangeText={(t) => set({ amount: t.replace(/[^0-9.]/g, "") })}
          keyboardType="decimal-pad"
          hint={value.amount ? `${money(parseFloat(value.amount) || 0, value.currency)} · tap the symbol to change currency` : "Money involved, if any — shows up in totals owed"}
          testID="form-amount-input"
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ gap: 6 }}>
        <View style={styles.dateRow}>
          <Field
            label="Expected by"
            placeholder="DD/MM/YYYY or “within 7–10 days”"
            value={typed}
            onChangeText={onTyped}
            testID="form-expected-input"
            hint={parsedHint}
            style={{ flex: 1 }}
          />
          <Pressable testID="form-date-picker-button" onPress={() => setShowPicker((s) => !s)} style={styles.calBtn} hitSlop={6}>
            <Icon name="calendar-outline" size={22} color={colors.brandPrimary} />
          </Pressable>
        </View>
        {showPicker && Platform.OS !== "web" ? (
          <DateTimePicker
            testID="form-date-picker"
            value={value.expectedAt ? new Date(value.expectedAt) : new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "calendar"}
            minimumDate={new Date()}
            onChange={onPicked}
            accentColor={colors.brandPrimary}
            themeVariant={undefined}
          />
        ) : null}
        {showPicker && Platform.OS === "web" ? (
          <Text style={styles.webPickerNote}>Type a date (DD/MM/YYYY) or a phrase — the native calendar opens on your phone.</Text>
        ) : null}
        <View style={styles.quickRow}>
          {quick.map(([label, fn]) => {
            const d = fn();
            const sel = value.expectedAt && dayjs(value.expectedAt).isSame(d, "day");
            return (
              <Pressable key={label} testID={`form-quick-${label.toLowerCase().replace(/\s/g, "-")}`} onPress={() => pick(label, d)} style={[styles.quick, sel && styles.quickSel]}>
                <Text style={[styles.quickText, sel && styles.quickTextSel]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.quickRow}>
          {CATEGORIES.map((c) => {
            const sel = value.category === c;
            return (
              <Pressable key={c} testID={`form-category-${c.toLowerCase()}`} onPress={() => set({ category: c })} style={[styles.quick, sel && styles.quickSel]}>
                <Text style={[styles.quickText, sel && styles.quickTextSel]}>{CATEGORY_LABEL[c]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {source ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Source</Text>
          <View style={styles.readonly}>
            <Text style={styles.readonlyText}>{source}</Text>
          </View>
        </View>
      ) : null}
      {showState ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Suggested state</Text>
          <StateSelector value={value.state} onChange={(s) => s !== "DONE" && set({ state: s })} includeDone={false} testID="form-state" />
        </View>
      ) : null}
      {showNotes ? <Field label="Notes (optional)" placeholder="Add any extra details…" value={value.notes} onChangeText={(notes) => set({ notes })} multiline testID="form-notes-input" /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary },
  dateRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  alert: { backgroundColor: c.warningTint, borderRadius: radius.md, padding: 12, gap: 10, marginTop: -6 },
  alertTitle: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  alertText: { fontSize: 12.5, color: c.onSurfaceSecondary, marginTop: 2, lineHeight: 17 },
  leadChip: { paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, justifyContent: "center" },
  leadChipSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  leadText: { fontSize: 12.5, fontWeight: "600", color: c.onSurface },
  currency: { fontSize: 18, fontWeight: "800", color: c.brandPrimary },
  calBtn: { width: 50, height: 50, marginTop: 25, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  webPickerNote: { fontSize: 12, color: c.muted },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quick: { height: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, justifyContent: "center" },
  quickSel: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  quickText: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary },
  quickTextSel: { color: c.onBrandTertiary },
  readonly: { height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary, paddingHorizontal: 14, justifyContent: "center" },
  readonlyText: { color: c.onSurfaceTertiary, fontSize: 14.5 },
}));
