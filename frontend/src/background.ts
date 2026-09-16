// Background reminder engine: periodically asks the backend which reminders are due (and escalates
// ignored ones to Needs Review), then fires local notifications with Follow Up / Mark Done / Later actions.
// Runs even when Await is closed. Requires a real build (not Expo Go / web).
import { Platform } from "react-native";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { CATEGORY_ACTIONS, CHANNELS, configureNotifications } from "@/src/notifications";
import { loadToken } from "@/src/api";

export const REMINDER_TASK = "await-reminder-tick";

export async function runReminderTick() {
  const token = await loadToken();
  if (!token) return 0;
  const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/reminders/tick`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return 0;
  const data = (await res.json()) as { fired: { awaitId: string; kind: string; title: string }[] };
  await configureNotifications();
  for (const f of data.fired) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: f.kind === "NEEDS_REVIEW" ? "Await · Needs Review" : "Await",
        body: f.title,
        categoryIdentifier: f.kind === "NEEDS_REVIEW" ? undefined : CATEGORY_ACTIONS,
        data: { awaitId: f.awaitId },
        ...(Platform.OS === "android" ? { channelId: f.kind === "NEEDS_REVIEW" ? CHANNELS.review : f.kind === "OVERDUE" ? CHANNELS.overdue : CHANNELS.due } : {}),
      } as any,
      trigger: null,
    });
  }
  return data.fired.length;
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(REMINDER_TASK, async () => {
    try {
      await runReminderTick();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerReminderTask() {
  if (Platform.OS === "web") return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    const already = await TaskManager.isTaskRegisteredAsync(REMINDER_TASK);
    if (!already) await BackgroundTask.registerTaskAsync(REMINDER_TASK, { minimumInterval: 60 * 6 }); // every ~6h (minutes)
    return true;
  } catch {
    return false; // Expo Go / unsupported
  }
}
