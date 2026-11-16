import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { useSession } from "../../lib/session";
import { color, radius, shadow, space, type } from "../../theme/tokens";
import { Enter } from "../Enter";
import { Press } from "../Press";
import { daysFrom } from "./when";

export function TodayStrip({ index, now }: { index: number; now: number }) {
  const { userKey } = useSession();
  const reminders = useQuery(api.reminders.list, { userKey });
  const today = reminders ? [...reminders.upcoming, ...reminders.sent].filter((r) => daysFrom(r.fireAt, now) === 0) : [];
  if (today.length === 0) return null;
  return (
    <Enter index={index} style={{ marginTop: space.xxl }}>
      <Press
        testID="reminders-today"
        accessibilityRole="link"
        accessibilityLabel="Reminders"
        haptic
        onPress={() => router.push("/reminders")}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.field, borderCurve: "continuous", backgroundColor: color.card, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs }}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.ink }} />
        <View style={{ flex: 1 }}>
          <Text style={type.rowName}>{today.length === 1 ? "1 reminder today" : `${today.length} reminders today`}</Text>
          <Text style={type.quiet} numberOfLines={1}>
            {today[0].title}
          </Text>
        </View>
        <Text style={{ fontSize: 20, color: color.inkQuiet }}>›</Text>
      </Press>
    </Enter>
  );
}
