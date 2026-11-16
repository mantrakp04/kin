import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Fragment } from "react";
import { Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Press } from "../Press";
import { Avatar, Card, Chip, Hairline, SectionLabel } from "../ui";
import { firstName } from "../../lib/format";
import { color, space, type } from "../../theme/tokens";

function relationText(relation: string, personName: string) {
  if (relation === "mutual") return "Follow each other";
  if (relation === "connection") return "Connected";
  if (relation === "follows") return `Followed by ${firstName(personName)}`;
  return `Follows ${firstName(personName)}`;
}

export function YouBothKnow({ personId, personName }: { personId: Id<"people">; personName: string }) {
  const mutuals = useQuery(api.social.mutualsFor, { personId });
  if (!mutuals || mutuals.length === 0) return null;
  return (
    <View style={{ gap: space.md, marginTop: space.xxl }} testID="you-both-know">
      <SectionLabel>You both know</SectionLabel>
      <Card style={{ paddingVertical: space.xs }}>
        {mutuals.map((m, i) => (
          <Fragment key={m.personId}>
            {i > 0 && <Hairline inset={space.lg} />}
            <Press
              testID={`mutual-${m.name}`}
              accessibilityRole="link"
              accessibilityLabel={m.name}
              haptic
              onPress={() => router.push({ pathname: "/person/[id]", params: { id: m.personId, from: firstName(personName) } })}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md }}
            >
              <Avatar name={m.name} hue={m.hue} size={34} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.rowName}>{m.name}</Text>
                <Text style={type.quiet}>{m.note && m.platforms.length === 0 ? m.note : relationText(m.relation, personName)}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: space.xs }}>
                {m.platforms.map((p) => (
                  <Chip key={p} outlined>
                    <Text style={{ fontSize: 12.5, color: color.inkSecondary }}>via {p}</Text>
                  </Chip>
                ))}
              </View>
            </Press>
          </Fragment>
        ))}
      </Card>
    </View>
  );
}
