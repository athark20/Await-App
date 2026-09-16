import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import { makeStyles, radius } from "@/src/theme";
import { Field, StateSelector } from "@/src/components/ui";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/src/types";

export interface AwaitFormValue {
  who: string;
  what: string;
  expectedAt: string | null; // ISO
  expectedText: string;
  category: Category;
  state: "MY_TURN" | "THEIR_TURN";
  notes: string;
}

export function emptyForm(): AwaitFormValue {
  return { who: "", what: "", expectedAt: null, expectedText: "", category: "OTHER", state: "THEIR_TURN", notes: "" };
}

function nextWeekday(day: number) {
  let d = dayjs().startOf("day");
  while (d.day() !== day || d.isSame(dayjs().startOf("day"))) d = d.add(1, "day");
  return d;
}

export function AwaitForm({ value, onChange, showNotes = true, showState = true, source }: { value: AwaitFormValue; onChange: (v: AwaitFormValue) => void; showNotes?: boolean; showState?: boolean; source?: string }) {
  const styles = useStyles();
  const set = (p: Partial<AwaitFormValue>) => onChange({ ...value, ...p });
  const [typed, setTyped] = useState(value.expectedAt ? dayjs(value.expectedAt).format("DD/MM/YYYY") : "");

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
    const m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      const d = dayjs(`${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T18:00:00`);
      if (d.isValid()) set({ expectedAt: d.toISOString(), expectedText: d.format("D MMM YYYY") });
    } else if (!t) set({ expectedAt: null });
  };

  return (
    <View style={{ gap: 16 }}>
      <Field label="Who" placeholder="e.g. Amazon, Sameer" value={value.who} onChangeText={(who) => set({ who })} testID="form-who-input" />
      <Field label="What" placeholder="e.g. Refund ₹3,499, Send quotation" value={value.what} onChangeText={(what) => set({ what })} testID="form-what-input" />
      <View style={{ gap: 6 }}>
        <Field
          label="Expected by"
          placeholder="DD/MM/YYYY"
          value={typed}
          onChangeText={onTyped}
          keyboardType="numbers-and-punctuation"
          testID="form-expected-input"
          hint={value.expectedAt ? `Expected ${dayjs(value.expectedAt).format("ddd, D MMM YYYY")}${value.expectedText && !/^\d/.test(value.expectedText) ? ` · “${value.expectedText}”` : ""}` : value.expectedText ? `AI read: “${value.expectedText}” — pick a date` : "Pick a quick option or type a date"}
        />
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
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quick: { height: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, justifyContent: "center" },
  quickSel: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  quickText: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary },
  quickTextSel: { color: c.onBrandTertiary },
  readonly: { height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary, paddingHorizontal: 14, justifyContent: "center" },
  readonlyText: { color: c.onSurfaceTertiary, fontSize: 14.5 },
}));
