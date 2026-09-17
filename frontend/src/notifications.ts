import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import dayjs from "dayjs";
import type { AwaitItem } from "@/src/types";

export const CHANNELS = {
  due: "await-due",
  overdue: "await-overdue",
  review: "await-needs-review",
} as const;

export const CATEGORY_ACTIONS = "await-item-actions";

let configured = false;

export async function configureNotifications() {
  if (configured || Platform.OS === "web") return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNELS.due, {
      name: "Due reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      description: "Reminders when an Await is due",
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.overdue, {
      name: "Overdue / Follow-up reminders",
      importance: Notifications.AndroidImportance.HIGH,
      description: "Overdue Awaits and follow-up nudges",
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.review, {
      name: "Needs Review summary",
      importance: Notifications.AndroidImportance.LOW,
      description: "Digest of Awaits that need your review",
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY_ACTIONS, [
    { identifier: "FOLLOW_UP", buttonTitle: "Follow Up", options: { opensAppToForeground: true } },
    { identifier: "MARK_DONE", buttonTitle: "Mark Done", options: { opensAppToForeground: false } },
    { identifier: "LATER", buttonTitle: "Later", options: { opensAppToForeground: false } },
  ]);
}

export async function getPermissionStatus() {
  if (Platform.OS === "web") return { granted: false, canAskAgain: false };
  const s = await Notifications.getPermissionsAsync();
  return { granted: s.granted, canAskAgain: s.canAskAgain };
}

export async function requestPermission() {
  if (Platform.OS === "web") return false;
  const s = await Notifications.requestPermissionsAsync();
  return s.granted;
}

function inQuietHours(d: dayjs.Dayjs) {
  const h = d.hour();
  return h >= 22 || h < 8;
}

export async function scheduleReminder(item: AwaitItem, quietHours = true) {
  if (Platform.OS === "web" || item.state === "DONE") return;
  const when = item.nextReminderAt ?? item.expectedAt;
  if (!when) return;
  let at = dayjs(when);
  if (item.reminderTime) {
    const [h, m] = item.reminderTime.split(":").map((x) => parseInt(x, 10));
    if (Number.isFinite(h) && Number.isFinite(m)) at = at.hour(h).minute(m).second(0);
  }
  if (at.isBefore(dayjs())) at = dayjs().add(10, "second");
  if (quietHours && !item.reminderTime && inQuietHours(at)) at = at.hour(9).minute(0);
  if (at.isBefore(dayjs())) at = at.add(1, "day");
  const overdue = item.attentionState === "OVERDUE";
  await Notifications.cancelScheduledNotificationAsync(item.id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: item.id,
    content: {
      title: "Await",
      body: overdue
        ? `${item.ownerName} hasn't ${item.commitment.charAt(0).toLowerCase() + item.commitment.slice(1)} yet.`
        : `${item.ownerName} · ${item.commitment} is due today.`,
      categoryIdentifier: CATEGORY_ACTIONS,
      data: { awaitId: item.id },
      ...(Platform.OS === "android" ? { channelId: overdue ? CHANNELS.overdue : CHANNELS.due } : {}),
    } as any,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at.toDate() },
  });
}

export async function cancelReminder(awaitId: string) {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(awaitId).catch(() => {});
}

export async function scheduleDailySummary(body: string, enabled: boolean, hour = 9, minute = 0) {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync("await-daily-summary").catch(() => {});
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: "await-daily-summary",
    content: {
      title: "Await · Today",
      body,
      data: { summary: true },
      ...(Platform.OS === "android" ? { channelId: CHANNELS.due } : {}),
    } as any,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

export async function scheduleWeeklyRecap(headline: string, enabled: boolean) {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync("await-weekly-recap").catch(() => {});
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: "await-weekly-recap",
    content: {
      title: "Await · Your week",
      body: headline,
      data: { recap: true },
      ...(Platform.OS === "android" ? { channelId: CHANNELS.review } : {}),
    } as any,
    // Sunday evening (expo weekday: 1 = Sunday)
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 18, minute: 0 },
  });
}

export async function fireTestNotification(item: AwaitItem) {
  if (Platform.OS === "web") return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Await",
      body: `${item.ownerName} hasn't ${item.commitment.charAt(0).toLowerCase() + item.commitment.slice(1)} yet.`,
      categoryIdentifier: CATEGORY_ACTIONS,
      data: { awaitId: item.id },
      ...(Platform.OS === "android" ? { channelId: CHANNELS.overdue } : {}),
    } as any,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
  });
}
