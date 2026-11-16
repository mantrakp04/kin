import { View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { Character, hasCharacter } from "./Characters";
import type { Timeline, Turn } from "./timeline";

export function talkAt(turn: Turn | null, t: number) {
  const word = turn?.words.find((w) => w.s <= t && t <= w.e);
  if (!word) return 0;
  return Math.abs(Math.sin((t - word.s) * 16));
}

export function Cast({ tl, turn, t }: { tl: Timeline; turn: Turn | null; t: number }) {
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const format = tl.style.format;
  if (format !== "dialogue" && format !== "rap" && format !== "narration") return null;
  const size = height * 0.3;
  const visible = (format === "rap" ? tl.style.cast : tl.style.cast.filter((c) => c.id === (turn?.speaker ?? tl.style.cast[0].id))).filter((c) => hasCharacter(c.id));
  const talk = talkAt(turn, t);
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: size + 20 }}>
      {visible.map((c) => {
        const active = c.id === turn?.speaker;
        const right = c.side === "right";
        const left = c.side === "left" ? 6 : right ? undefined : (width - size * (200 / 240)) / 2;
        return (
          <Animated.View
            key={c.id + (format === "rap" ? "" : ":" + turn?.speaker)}
            entering={still ? undefined : FadeIn.duration(160)}
            style={{
              position: "absolute",
              bottom: 8,
              left,
              right: right ? 6 : undefined,
              opacity: format !== "rap" || active ? 1 : 0.6,
              transform: [{ scale: format === "rap" && !active ? 0.86 : 1 }],
            }}
          >
            <Character id={c.id} talk={active ? talk : 0} height={size} mirror={right} />
          </Animated.View>
        );
      })}
    </View>
  );
}
