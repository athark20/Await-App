import React, { useMemo, useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import { Sheet, type SheetOption } from "@/src/components/Sheet";
import { useTheme } from "@/src/theme";
import type { AwaitItem } from "@/src/types";

export interface SnoozePick {
  until: string;
  days: number;
  label: string;
}

type Choice = SheetOption & { at?: dayjs.Dayjs };

const REMIND_HOUR = 9;
const at9 = (d: dayjs.Dayjs) => d.startOf("day").hour(REMIND_HOUR);

/** Context-aware snooze suggestions so follow-ups land when they're actually useful. */
export function buildSnoozeChoices(item?: Pick<AwaitItem, "ownerName" | "expectedAt" | "nextCheckAt"> | null, now = dayjs()): Choice[] {
  const today = now.startOf("day");
  const fmt = (d: dayjs.Dayjs) => d.format("ddd, D MMM");
  const out: Choice[] = [];
  const expected = item?.expectedAt ? dayjs(item.expectedAt).startOf("day") : null;
  const check = item?.nextCheckAt ? dayjs(item.nextCheckAt) : null;
  const owner = item?.ownerName ?? "They";

  const tomorrow = at9(today.add(1, "day"));
  out.push({ key: "tomorrow", label: "Tomorrow morning", subtitle: `${fmt(tomorrow)} · 9 AM`, icon: "sunny-outline", at: tomorrow });

  if (expected && expected.isAfter(today)) {
    const after = at9(expected.add(1, "day"));
    out.push({ key: "after_promise", label: "After their promised date", subtitle: `${owner} promised ${fmt(expected)} · remind ${fmt(after)}`, icon: "flag-outline", at: after });
  } else if (expected) {
    const grace = at9(today.add(2, "day"));
    const late = today.diff(expected, "day");
    out.push({ key: "grace", label: "Give them 2 more days", subtitle: `${late > 0 ? `Already ${late} ${late === 1 ? "day" : "days"} late` : "Due today"} · remind ${fmt(grace)}`, icon: "hourglass-outline", at: grace });
  }

  if (check && check.isAfter(now)) {
    const c = at9(check);
    if (!out.some((o) => o.at?.isSame(c, "day"))) out.push({ key: "checkin", label: "At my follow-up check-in", subtitle: fmt(c), icon: "chatbubble-ellipses-outline", at: c });
  }

  const daysToMonday = ((8 - today.day()) % 7) || 7;
  const monday = at9(today.add(daysToMonday, "day"));
  if (!out.some((o) => o.at?.isSame(monday, "day"))) out.push({ key: "monday", label: "Next Monday", subtitle: `${fmt(monday)} · start of the week`, icon: "briefcase-outline", at: monday });

  const week = at9(today.add(7, "day"));
  if (!out.some((o) => o.at?.isSame(week, "day"))) out.push({ key: "week", label: "In a week", subtitle: fmt(week), icon: "calendar-number-outline", at: week });

  if (Platform.OS === "web") {
    const two = at9(today.add(14, "day"));
    out.push({ key: "two_weeks", label: "In 2 weeks", subtitle: fmt(two), icon: "calendar-outline", at: two });
  } else {
    out.push({ key: "custom", label: "Pick a date…", subtitle: "Choose exactly when to be reminded", icon: "calendar-outline" });
  }
  return out.slice(0, 6);
}

export function toPick(at: dayjs.Dayjs, label: string): SnoozePick {
  const days = Math.max(1, at.startOf("day").diff(dayjs().startOf("day"), "day"));
  return { until: at.toISOString(), days, label };
}

export function SnoozeSheet({ visible, onClose, item, onPick, testID = "remind-later-sheet" }: {
  visible: boolean;
  onClose: () => void;
  item?: Pick<AwaitItem, "ownerName" | "expectedAt" | "nextCheckAt"> | null;
  onPick: (p: SnoozePick) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [custom, setCustom] = useState(false);
  const choices = useMemo(() => buildSnoozeChoices(item), [item]);

  const select = (key: string) => {
    if (key === "custom") return setCustom(true);
    const c = choices.find((o) => o.key === key);
    if (c?.at) onPick(toPick(c.at, c.label));
  };

  const onPicked = (e: DateTimePickerEvent, d?: Date) => {
    setCustom(false);
    if (e.type === "dismissed" || !d) return;
    const at = at9(dayjs(d));
    onPick(toPick(at, `Remind ${at.format("ddd, D MMM")}`));
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => { setCustom(false); onClose(); }}
      icon="alarm-outline"
      title="Remind me later"
      subtitle={item?.ownerName ? `Pick when Await should nudge you about ${item.ownerName}.` : "Choose when to be reminded again."}
      testID={testID}
      options={choices.map(({ at: _at, ...o }) => o)}
      onSelect={select}
    >
      {custom && Platform.OS !== "web" ? (
        <View style={{ marginTop: 12, alignItems: "center" }}>
          <DateTimePicker
            testID={`${testID}-date-picker`}
            value={dayjs().add(1, "day").toDate()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "calendar"}
            minimumDate={dayjs().add(1, "day").toDate()}
            onChange={onPicked}
            accentColor={colors.brandPrimary}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
