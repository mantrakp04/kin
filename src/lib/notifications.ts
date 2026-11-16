import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

export type Permission = "granted" | "denied" | "undetermined" | "unavailable";
export type LocalReminder = { _id: string; title: string; body: string; fireAt: number; person: { _id: string } | null };

const native = Platform.OS === "ios" || Platform.OS === "android";
const HORIZON = 7 * 24 * 60 * 60 * 1000;
const CATCH_UP = 15 * 60 * 1000;
const CHANNEL = "reminders";

const shown = new Set<string>();
const scheduled = new Set<string>();

if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const id = notification.request.content.data?.reminderId;
      const repeat = typeof id === "string" && shown.has(id);
      if (typeof id === "string") shown.add(id);
      return { shouldShowBanner: !repeat, shouldShowList: !repeat, shouldPlaySound: !repeat, shouldSetBadge: false };
    },
  });
}

let current: Permission | null = null;
const listeners = new Set<(p: Permission) => void>();
const publish = (p: Permission) => {
  current = p;
  listeners.forEach((l) => l(p));
};

async function readPermission(): Promise<Permission> {
  if (!native) return "unavailable";
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? "granted" : p.status === "denied" ? "denied" : "undetermined";
}

export function usePermission() {
  const [permission, setPermission] = useState<Permission | null>(current);
  useEffect(() => {
    listeners.add(setPermission);
    readPermission().then(publish);
    const sub = AppState.addEventListener("change", (s) => s === "active" && readPermission().then(publish));
    return () => {
      listeners.delete(setPermission);
      sub.remove();
    };
  }, []);
  return permission;
}

async function ensureChannel() {
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync(CHANNEL, { name: "Reminders", importance: Notifications.AndroidImportance.HIGH });
}

export async function requestPermission(): Promise<Permission> {
  if (!native) return "unavailable";
  await ensureChannel();
  const existing = await Notifications.getPermissionsAsync();
  const next = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  const result: Permission = next.granted ? "granted" : "denied";
  publish(result);
  return result;
}

export async function expoPushToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!native || !projectId) return null;
  try {
    await ensureChannel();
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.log("notifications: no Expo push token, using local notifications only", e);
    return null;
  }
}

export function reminderUrl(personId: string | null | undefined) {
  return personId ? `kin://person/${personId}` : "kin://reminders";
}

function content(r: LocalReminder): Notifications.NotificationContentInput {
  return { title: r.title, body: r.body || null, sound: "default", data: { kin: true, reminderId: r._id, personId: r.person?._id ?? null, url: reminderUrl(r.person?._id) } };
}

let chain: Promise<void> = Promise.resolve();

export function syncLocal(rows: LocalReminder[]) {
  chain = chain.then(() => schedule(rows)).catch((e) => console.log("notifications: local sync failed", e));
  return chain;
}

async function schedule(rows: LocalReminder[]) {
  if (!native || (await readPermission()) !== "granted") return;
  await ensureChannel();
  const now = Date.now();
  const desired = rows.filter((r) => r.fireAt > now && r.fireAt <= now + HORIZON);
  const keep = new Set(desired.map((r) => r._id));
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    if (n.content.data?.kin && !keep.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
      scheduled.delete(n.identifier);
    }
  }
  for (const r of desired) {
    await Notifications.cancelScheduledNotificationAsync(r._id);
    await Notifications.scheduleNotificationAsync({
      identifier: r._id,
      content: content(r),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.fireAt, channelId: Platform.OS === "android" ? CHANNEL : undefined },
    });
    scheduled.add(r._id);
  }
  for (const r of rows) {
    if (r.fireAt > now || r.fireAt < now - CATCH_UP || scheduled.has(r._id) || shown.has(r._id)) continue;
    await Notifications.scheduleNotificationAsync({ identifier: r._id, content: content(r), trigger: null });
  }
}

function open(notification: Notifications.Notification) {
  const url = notification.request.content.data?.url;
  if (typeof url !== "string" || !url.startsWith("kin://")) return;
  router.push(url.replace("kin://", "/"));
  Notifications.clearLastNotificationResponse();
}

export function useNotificationRouting() {
  useEffect(() => {
    if (!native) return;
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) open(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification));
    return () => sub.remove();
  }, []);
}
