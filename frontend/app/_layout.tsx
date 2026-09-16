import React, { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { LogBox, Platform, View, ActivityIndicator } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { PrefsProvider, usePrefs } from "@/src/prefs";
import { ToastProvider } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import { configureNotifications } from "@/src/notifications";
import { handleIncomingUrl } from "@/src/share-intent";
import { api } from "@/src/api";

LogBox.ignoreAllLogs(true);

function Gate() {
  const { user, loading } = useAuth();
  const { ready } = usePrefs();
  const { colors, scheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    configureNotifications();
  }, []);

  // Deep links: await://share?... and await://item/<id>
  useEffect(() => {
    if (!user) return;
    Linking.getInitialURL().then((u) => u && handleIncomingUrl(u));
    const sub = Linking.addEventListener("url", ({ url }) => handleIncomingUrl(url));
    return () => sub.remove();
  }, [user]);

  // Notification action buttons: Follow Up | Mark Done | Later
  useEffect(() => {
    if (Platform.OS === "web" || !user) return;
    const sub = Notifications.addNotificationResponseReceivedListener(async (resp) => {
      const id = resp.notification.request.content.data?.awaitId as string | undefined;
      if (!id) return;
      const action = resp.actionIdentifier;
      if (action === "MARK_DONE") {
        await api(`/awaits/${id}/state`, { method: "POST", json: { state: "DONE" } }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["awaits"] });
      } else if (action === "LATER") {
        await api(`/awaits/${id}/snooze`, { method: "POST", json: { days: 1 } }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["awaits"] });
      } else if (action === "FOLLOW_UP") {
        router.push(`/followup/${id}`);
      } else {
        router.push(`/item/${id}`);
      }
    });
    return () => sub.remove();
  }, [user, router]);

  if (loading || !ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }} testID="splash-loading">
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "slide_from_right" }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding/notifications" />
          <Stack.Screen name="item/[id]" />
          <Stack.Screen name="followup/[id]" />
          <Stack.Screen name="capture/share" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="capture/confirm" />
          <Stack.Screen name="capture/manual" />
          <Stack.Screen name="capture/screenshot" />
          <Stack.Screen name="capture/voice" />
          <Stack.Screen name="capture/match" />
          <Stack.Screen name="needs-review" />
          <Stack.Screen name="history" />
          <Stack.Screen name="stats" />
          <Stack.Screen name="settings/notifications" />
          <Stack.Screen name="settings/preferences" />
          <Stack.Screen name="settings/privacy" />
          <Stack.Screen name="settings/help" />
          <Stack.Screen name="settings/upgrade" />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <PrefsProvider>
            <AuthProvider>
              <KeyboardProvider>
                <ToastProvider>
                  <Gate />
                </ToastProvider>
              </KeyboardProvider>
            </AuthProvider>
          </PrefsProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
