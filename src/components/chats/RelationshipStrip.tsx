import { useQuery } from "convex/react";
import { Text } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { color, space, type } from "../../theme/tokens";
import { Card } from "../ui";

export function RelationshipStrip({ personId, now }: { personId: Id<"people">; now: number }) {
  const r = useQuery(api.chats.relationship, { personId, now });
  if (!r) return null;
  const trend = r.trend === "warming" ? "Talking more lately" : r.trend === "cooling" ? "Talking less lately" : null;
  const detail = [trend, r.sources.length ? `From ${r.sources.join(" and ")}` : null].filter(Boolean).join(" · ");
  return (
    <Card style={{ marginTop: space.xl, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2 }}>
      <Text testID="relationship-strip" style={[type.bodySmall, { fontWeight: "500" }]}>
        {r.strip}
      </Text>
      {detail ? <Text style={[type.quiet, { color: color.inkQuiet }]}>{detail}</Text> : null}
    </Card>
  );
}
