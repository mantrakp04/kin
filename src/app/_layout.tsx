import { ConvexProvider } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { convex } from "../lib/convex";
import { SessionProvider } from "../lib/session";
import { ToastProvider } from "../components/Toast";
import { ReminderSync } from "../components/reminders/ReminderSync";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexProvider client={convex}>
        <SessionProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <ReminderSync />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#EFEEFC" } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="person/[id]" />
              <Stack.Screen name="you" />
              <Stack.Screen name="reminders" />
              <Stack.Screen name="agent" />
              <Stack.Screen name="share" options={{ presentation: "fullScreenModal", animation: "fade_from_bottom" }} />
              <Stack.Screen name="story/[id]" options={{ presentation: "fullScreenModal", animation: "fade", gestureEnabled: false, contentStyle: { backgroundColor: "#000" } }} />
              <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
            </Stack>
          </ToastProvider>
        </SessionProvider>
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}
