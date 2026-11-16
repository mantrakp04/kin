import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "../../../convex/_generated/api";
import { expoPushToken, syncLocal, useNotificationRouting, usePermission } from "../../lib/notifications";
import { useSession } from "../../lib/session";

export function ReminderSync() {
  const { userKey } = useSession();
  const permission = usePermission();
  const reminders = useQuery(api.reminders.list, { userKey });
  const registerToken = useMutation(api.pushTokens.registerToken);
  useNotificationRouting();

  useEffect(() => {
    if (permission !== "granted") return;
    expoPushToken().then((token) => {
      if (token) registerToken({ userKey, token, platform: Platform.OS }).catch(() => {});
    });
  }, [permission, userKey]);

  const rows = reminders ? [...reminders.upcoming, ...reminders.sent] : null;
  const signature = rows ? JSON.stringify(rows.map((r) => [r._id, r.fireAt, r.title, r.body, r.status])) : "";
  useEffect(() => {
    if (permission === "granted" && rows) syncLocal(rows);
  }, [permission, signature]);

  return null;
}
