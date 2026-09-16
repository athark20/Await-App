import { Redirect } from "expo-router";
import { usePrefs } from "@/src/prefs";

export default function Index() {
  const { prefs } = usePrefs();
  if (!prefs.notifAsked) return <Redirect href="/onboarding/notifications" />;
  return <Redirect href="/(tabs)" />;
}
