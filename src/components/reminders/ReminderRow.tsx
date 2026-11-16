import { router } from "expo-router";
import { Text, View } from "react-native";
import type { ReminderRow as Row } from "../../../convex/reminders";
import { Press } from "../Press";
import { Avatar } from "../ui";
import { color, radius, space, type } from "../../theme/tokens";
import { whenLabel } from "./when";

function Pill({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={label} haptic onPress={onPress} style={{ height: 28, paddingHorizontal: 12, borderRadius: radius.capsule, borderCurve: "continuous", justifyContent: "center", backgroundColor: "rgba(27,26,34,0.05)" }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: color.ink }}>{label}</Text>
    </Press>
  );
}

export function ReminderRow({ reminder, now, onDone, onSnooze }: { reminder: Row; now: number; onDone: () => void; onSnooze?: () => void }) {
  const r = reminder;
  const when = whenLabel(r.fireAt, now) + (r.status === "snoozed" ? " · Snoozed" : "");
  return (
    <View testID={`reminder-row-${r.title}`} style={{ flexDirection: "row", gap: space.md, paddingVertical: space.md }}>
      <Press
        accessibilityRole={r.person ? "link" : undefined}
        accessibilityLabel={r.person?.name ?? r.title}
        disabled={!r.person}
        scale={0.96}
        onPress={() => r.person && router.push({ pathname: "/person/[id]", params: { id: r.person._id, from: "Reminders" } })}
      >
        {r.person ? <Avatar name={r.person.name} hue={r.person.hue} size={28} /> : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.hairline }} />}
      </Press>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[type.rowName, r.status === "sent" && { color: color.inkSecondary }]}>{r.title}</Text>
        {r.body ? (
          <Text style={[type.bodySmall, { color: color.inkSecondary, fontSize: 14 }]} numberOfLines={2}>
            {r.body}
          </Text>
        ) : null}
        <Text style={type.quiet}>{when}</Text>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
          <Pill testID={`reminder-done-${r.title}`} label="Done" onPress={onDone} />
          {onSnooze && <Pill testID={`reminder-snooze-${r.title}`} label="Snooze 1 day" onPress={onSnooze} />}
        </View>
      </View>
    </View>
  );
}
