import { Canvas, Circle, Group, SweepGradient, useClock, vec } from "@shopify/react-native-skia";
import { useAction, useQuery } from "convex/react";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useDerivedValue, useReducedMotion } from "react-native-reanimated";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useSession } from "../../lib/session";
import { color, space } from "../../theme/tokens";
import { Enter } from "../Enter";
import { Press } from "../Press";
import { Avatar } from "../ui";

const SIZE = 70;
const RING = ["#FF844F", "#F773A5", "#8B5CF6", "#3139FB", "#FF844F"];

function Ring({ live }: { live: boolean }) {
  const clock = useClock();
  const still = useReducedMotion();
  const spin = useDerivedValue(() => [{ rotate: still ? 0 : clock.value / 900 }]);
  return (
    <Canvas style={{ position: "absolute", width: SIZE, height: SIZE }}>
      <Group origin={vec(SIZE / 2, SIZE / 2)} transform={spin}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} style="stroke" strokeWidth={live ? 3 : 1.5} opacity={live ? 1 : 0.5}>
          <SweepGradient c={vec(SIZE / 2, SIZE / 2)} colors={RING} />
        </Circle>
      </Group>
    </Canvas>
  );
}

const hour = () => Math.floor(Date.now() / 3600000) * 3600000;

export function StoriesRow({ index = 0 }: { index?: number }) {
  const { userKey } = useSession();
  const [now] = useState(hour);
  const days = useQuery(api.stories.list, { userKey, now });
  const generate = useAction(api.stories.generate);
  const started = useRef(new Set<string>());
  const [opening, setOpening] = useState<string | null>(null);

  const today = days?.find((d) => d.label === "Today");
  useEffect(() => {
    if (!today || today.storyId || started.current.has(userKey + today.day)) return;
    started.current.add(userKey + today.day);
    generate({ userKey }).catch(() => {});
  }, [today, userKey, generate]);

  if (!days?.length) return null;

  const open = async (day: string, storyId: Id<"stories"> | null) => {
    if (storyId) return router.push({ pathname: "/story/[id]", params: { id: storyId } });
    setOpening(day);
    try {
      const id = await generate({ userKey, day });
      router.push({ pathname: "/story/[id]", params: { id } });
    } finally {
      setOpening(null);
    }
  };

  const d = today ?? days[0];
  const making = opening === d.day || d.status === "generating";
  const unseen = !d.seen && d.status !== "empty";
  const subtitle = making
    ? "Making your story"
    : d.status === "empty"
      ? "Quiet day, nothing new"
      : [d.recap ? "Yesterday" : null, d.coming ? d.coming + " coming up" : null].filter(Boolean).join(" + ") || "Your recap";

  return (
    <Enter index={index} style={{ marginTop: space.lg }}>
      <View testID="stories-row">
        <Press
          testID={"story-day-" + d.label}
          accessibilityRole="button"
          accessibilityLabel={"Your day story, " + subtitle + (unseen && !making ? ", new" : "")}
          haptic
          onPress={() => open(d.day, d.storyId)}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: 10, paddingRight: 16, borderRadius: 24, backgroundColor: color.card, borderWidth: 1, borderColor: color.cardEdge }}
        >
          <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
            {unseen || making ? <Ring live={unseen} /> : <View style={{ position: "absolute", width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1, borderColor: color.edge }} />}
            {d.cover ? (
              <Avatar name={d.cover.name} hue={d.cover.hue} size={SIZE - 12} />
            ) : (
              <View style={{ width: SIZE - 12, height: SIZE - 12, borderRadius: SIZE, backgroundColor: color.card, borderWidth: 1, borderColor: color.cardEdge }} />
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: unseen ? "700" : "600", color: color.ink }}>
              Your day
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13.5, color: color.inkSecondary }}>
              {subtitle}
            </Text>
          </View>
          {unseen && !making ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.accent }} /> : null}
        </Press>
      </View>
    </Enter>
  );
}
