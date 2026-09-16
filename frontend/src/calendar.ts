// Calendar sync: device calendar (which Android syncs to the user's Google account) + Google Calendar web link.
import { Linking, Platform } from "react-native";
import * as Calendar from "expo-calendar";
import dayjs from "dayjs";
import { api } from "@/src/api";
import { amountLabel } from "@/src/format";
import type { AwaitItem } from "@/src/types";

export type CalendarResult = { ok: true; eventId: string; updated: boolean } | { ok: false; reason: "no-date" | "denied" | "blocked" | "unsupported" | "no-calendar" | "error" };

function eventTitle(item: AwaitItem) {
  return `Await · ${item.commitment}${amountLabel(item) ? ` (${amountLabel(item)})` : ""} · ${item.ownerName}`;
}
function eventNotes(item: AwaitItem) {
  return [`${item.ownerName} promised: ${item.commitment}`, item.notes ? `Notes: ${item.notes}` : "", "Added by Await · Follow up. Close the loop."].filter(Boolean).join("\n");
}

/** Deep link that pre-fills a Google Calendar event — works on web and any device, no OAuth needed. */
export function googleCalendarUrl(item: AwaitItem) {
  const day = dayjs(item.expectedAt ?? undefined).startOf("day");
  const dates = `${day.format("YYYYMMDD")}/${day.add(1, "day").format("YYYYMMDD")}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: eventTitle(item), dates, details: eventNotes(item) });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function openGoogleCalendar(item: AwaitItem) {
  return Linking.openURL(googleCalendarUrl(item));
}

export async function calendarPermissionState(): Promise<"granted" | "ask" | "blocked" | "unsupported"> {
  if (Platform.OS === "web") return "unsupported";
  const p = await Calendar.getCalendarPermissions();
  if (p.granted) return "granted";
  return p.canAskAgain ? "ask" : "blocked";
}

async function pickCalendar(): Promise<Calendar.ExpoCalendar | null> {
  if (Platform.OS === "ios") {
    try {
      return Calendar.getDefaultCalendarSync();
    } catch {}
  }
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const writable = cals.filter((c) => c.allowsModifications);
  // Prefer the primary Google calendar on Android so events show up in Google Calendar.
  const google = writable.find((c) => c.isPrimary) ?? writable.find((c) => /google|gmail/i.test(`${c.source?.name ?? ""} ${c.source?.type ?? ""}`));
  return google ?? writable[0] ?? null;
}

/** Add (or update) the Await's promised date in the device calendar. Handles the full permission flow. */
export async function syncToDeviceCalendar(item: AwaitItem, opts: { requestIfNeeded?: boolean } = {}): Promise<CalendarResult> {
  if (Platform.OS === "web") return { ok: false, reason: "unsupported" };
  if (!item.expectedAt) return { ok: false, reason: "no-date" };
  try {
    let perm = await Calendar.getCalendarPermissions();
    if (!perm.granted) {
      if (!perm.canAskAgain) return { ok: false, reason: "blocked" };
      if (!opts.requestIfNeeded) return { ok: false, reason: "denied" };
      perm = await Calendar.requestCalendarPermissions();
      if (!perm.granted) return { ok: false, reason: perm.canAskAgain ? "denied" : "blocked" };
    }
    const start = dayjs(item.expectedAt).startOf("day");
    const details: Partial<Calendar.ModifiableEventProperties> = {
      title: eventTitle(item),
      notes: eventNotes(item),
      startDate: start.toDate(),
      endDate: start.add(1, "day").toDate(),
      allDay: true,
      alarms: [{ relativeOffset: -15 * 60 }], // 9 AM the day of, for an all-day event on most platforms
    };
    if (item.calendarEventId) {
      try {
        const existing = await Calendar.ExpoCalendarEvent.get(item.calendarEventId);
        await existing.update(details);
        return { ok: true, eventId: item.calendarEventId, updated: true };
      } catch {
        // event was deleted by the user — fall through and recreate
      }
    }
    const cal = await pickCalendar();
    if (!cal) return { ok: false, reason: "no-calendar" };
    const created = await cal.createEvent(details);
    const eventId = created.id;
    await api(`/awaits/${item.id}`, { method: "PATCH", json: { calendarEventId: eventId } }).catch(() => {});
    return { ok: true, eventId, updated: false };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function removeFromDeviceCalendar(item: AwaitItem) {
  if (Platform.OS === "web" || !item.calendarEventId) return;
  try {
    const ev = await Calendar.ExpoCalendarEvent.get(item.calendarEventId);
    await ev.delete();
  } catch {}
}

export const CALENDAR_REASON: Record<Exclude<CalendarResult, { ok: true }>["reason"], string> = {
  "no-date": "Add an expected date first, then sync it to your calendar.",
  denied: "Calendar access is needed to add the date.",
  blocked: "Calendar access is off. Enable it in Settings to sync dates.",
  unsupported: "Device calendar isn’t available in the web preview. Use Google Calendar instead.",
  "no-calendar": "No writable calendar found on this device.",
  error: "Couldn’t add to calendar right now.",
};
