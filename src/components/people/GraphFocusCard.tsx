import { router } from "expo-router";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Press } from "../Press";
import { Avatar, Button, Chip, SectionLabel } from "../ui";
import { color, radius, shadow, space, type } from "../../theme/tokens";
import { TIER_LABEL, neighbors, type GraphData } from "./graphLayout";

export function GraphFocusCard({
  data,
  index,
  path,
  bottom,
  onClose,
}: {
  data: GraphData;
  index: number;
  path: number[] | null | undefined;
  bottom: number;
  onClose: () => void;
}) {
  const node = data.nodes[index];
  const mutuals = neighbors(data, index).map((i) => data.nodes[i]);
  const first = node.name.split(" ")[0];
  const via = node.via.length ? node.via : ["Contacts"];
  const known = mutuals.length
    ? "You both know " + mutuals.length + " · " + mutuals.slice(0, 3).map((m) => m.name.split(" ")[0]).join(", ") + (mutuals.length > 3 ? " and " + (mutuals.length - 3) + " more" : "")
    : "No mutuals in your contacts yet";
  return (
    <Animated.View
      testID="graph-focus-card"
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      style={{
        position: "absolute",
        left: space.md,
        right: space.md,
        bottom: bottom + space.sm,
        padding: space.xl,
        borderRadius: radius.sheet,
        borderCurve: "continuous",
        backgroundColor: color.cardSolid,
        borderWidth: 1,
        borderColor: color.cardEdge,
        boxShadow: shadow.xl,
        gap: space.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={node.name} hue={node.hue} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={[type.name, { fontSize: 28 }]} numberOfLines={1}>
            {node.name}
          </Text>
          <Text style={[type.quiet, { fontSize: 14, marginTop: 1 }]} numberOfLines={1}>
            {TIER_LABEL[node.tier]} · {node.city}
          </Text>
        </View>
        <Press testID="graph-focus-close" accessibilityRole="button" accessibilityLabel="Close" scale={0.94} onPress={onClose} hitSlop={10}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: color.inkQuiet }}>Close</Text>
        </Press>
      </View>
      <Text style={type.bodySmall}>{known}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <SectionLabel>Connected via</SectionLabel>
        {via.map((v) => (
          <Chip key={v} outlined>
            <Text style={{ fontSize: 13, color: color.ink }}>{v}</Text>
          </Chip>
        ))}
      </View>
      {path !== undefined && (
        <View testID="graph-intro-path" style={{ gap: 4 }}>
          <SectionLabel>Intro path</SectionLabel>
          <Text style={[type.bodySmall, { fontWeight: "600" }]}>
            {path ? path.map((i) => (i === 0 ? "You" : data.nodes[i].name.split(" ")[0])).join("  →  ") : "No path through mutuals yet. You know " + first + " directly."}
          </Text>
        </View>
      )}
      {path === undefined && <Text style={[type.quiet, { marginTop: -4 }]}>Hold a person to see who could introduce you.</Text>}
      <Button testID="graph-open-person" label={"Open " + first} onPress={() => router.push("/person/" + node.id + "?from=People")} />
    </Animated.View>
  );
}
