import { useMutation, useQuery } from "convex/react";
import { router, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { ReminderRow as Row } from "../../convex/reminders";
import { Enter } from "../components/Enter";
import { Screen } from "../components/Screen";
import { useToast } from "../components/Toast";
import { Button, Card, Hairline, IconButton, SectionLabel } from "../components/ui";
import { NewReminderSheet } from "../components/reminders/NewReminderSheet";
import { ReminderRow } from "../components/reminders/ReminderRow";
import { section, snoozeUntil, whenLabel } from "../components/reminders/when";
import { requestPermission, usePermission } from "../lib/notifications";
import { useSession } from "../lib/session";
import { color, space, type } from "../theme/tokens";

const SECTIONS = ["Today", "This week", "Later"] as const;

function Back() {
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));
  return (
    <IconButton label="Back" onPress={back}>
      <Text testID="reminders-back" style={{ fontSize: 22, lineHeight: 24, color: color.ink, marginTop: -2 }}>‹</Text>
    </IconButton>
  );
}

export default function RemindersPage() {
  const { userKey } = useSession();
  const toast = useToast();
  const reminders = useQuery(api.reminders.list, { userKey });
  const complete = useMutation(api.reminders.complete);
  const snooze = useMutation(api.reminders.snooze);
  const permission = usePermission();
  const [sheet, setSheet] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(tick);
  }, []);

  const enable = async () => {
    if (permission === "denied") {
      Linking.openSettings();
      return;
    }
    const result = await requestPermission();
    toast(result === "granted" ? "Reminders are on" : "Notifications are off in Settings");
  };

  const done = (r: Row) => complete({ id: r._id }).catch(() => toast("Could not update the reminder"));
  const later = (r: Row) => {
    const until = snoozeUntil(r.fireAt, now);
    snooze({ id: r._id, until })
      .then(() => toast(`Snoozed until ${whenLabel(until)}`))
      .catch(() => toast("Could not snooze the reminder"));
  };

  const groups: Array<{ name: string; rows: Row[] }> = SECTIONS.map((name) => ({ name, rows: (reminders?.upcoming ?? []).filter((r) => section(r.fireAt, now) === name) })).filter((g) => g.rows.length > 0);
  if (reminders?.sent.length) groups.push({ name: "Sent", rows: reminders.sent });

  let i = 0;
  return (
    <Screen dock={false}>
      <Back />
      <Enter index={i++} style={{ marginTop: space.xl, gap: space.xs }}>
        <Text style={type.title}>Reminders</Text>
        <Text style={[type.bodySmall, { color: color.inkSecondary }]}>Birthdays, plans, and friends in town.</Text>
      </Enter>

      {permission !== null && permission !== "granted" && permission !== "unavailable" && (
        <Enter index={i++} style={{ marginTop: space.xl }}>
          <Card style={{ padding: space.lg, gap: space.md }}>
            <Text style={type.bodySmall}>Kin tells you the day before a birthday, two hours before plans, and when a friend is in town.</Text>
            <Button testID="reminders-enable" label={permission === "denied" ? "Open Settings" : "Turn on reminders"} variant="ink" onPress={enable} style={{ alignSelf: "flex-start" }} />
          </Card>
        </Enter>
      )}

      <Enter index={i++} style={{ marginTop: space.xl }}>
        <Button testID="reminder-new" label="New reminder" variant="raised" onPress={() => setSheet(true)} style={{ alignSelf: "flex-start" }} />
      </Enter>

      {reminders && groups.length === 0 && (
        <Enter index={i++} style={{ marginTop: space.xxl }}>
          <Text style={type.quiet}>Nothing scheduled. Kin adds birthdays and plans as they come up.</Text>
        </Enter>
      )}

      {groups.map((g) => (
        <Enter key={g.name} index={i++} style={{ marginTop: space.xxl }}>
          <SectionLabel style={{ marginBottom: space.md }}>{g.name}</SectionLabel>
          <Card style={{ paddingHorizontal: space.lg, paddingVertical: space.xs }}>
            {g.rows.map((r, n) => (
              <View key={r._id}>
                {n > 0 && <Hairline inset={40} />}
                <ReminderRow reminder={r} now={now} onDone={() => done(r)} onSnooze={() => later(r)} />
              </View>
            ))}
          </Card>
        </Enter>
      ))}

      <NewReminderSheet visible={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen dock={false}>
      <Back />
      <Text style={[type.body, { marginTop: space.xl, marginBottom: space.lg }]}>Reminders could not load.</Text>
      <Button label="Try again" variant="raised" onPress={retry} style={{ alignSelf: "flex-start" }} />
    </Screen>
  );
}
