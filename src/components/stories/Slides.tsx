import { Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown, SlideInRight, useReducedMotion } from "react-native-reanimated";
import { avatarColors, color, font } from "../../theme/tokens";
import { PersonPhoto } from "./Pictures";
import type { StoryItem } from "./types";
import { splitWords, type Timeline, type Turn } from "./timeline";

function Graphic({ item }: { item: StoryItem }) {
  const stat = item.text.match(/\d+(?::\d+)+|\d+(?:\.\d+)?\s?(?:miles|km|k)\b/i)?.[0];
  if (stat) return <Text style={{ fontFamily: font.serif, fontSize: 64, letterSpacing: -1.5, color: color.ink }}>{stat}</Text>;
  if (item.kind === "trip" || item.kind === "move")
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color.ink }} />
        <View style={{ width: 120, borderTopWidth: 2, borderStyle: "dashed", borderColor: color.inkQuiet }} />
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.accent, borderWidth: 4, borderColor: "#FFFFFF", boxShadow: "0 2px 6px rgba(49,57,251,0.4)" }} />
      </View>
    );
  if (item.kind === "birthday")
    return (
      <View style={{ width: 70, borderRadius: 14, borderCurve: "continuous", overflow: "hidden", backgroundColor: "#FFFFFF", boxShadow: "0 1px 1px rgba(0,0,0,0.04), 0 6px 12px -4px rgba(0,0,0,0.12)" }}>
        <View style={{ height: 18, backgroundColor: "#F25C54" }} />
        <Text style={{ textAlign: "center", fontFamily: font.serif, fontSize: 30, paddingVertical: 6, color: color.ink }}>{item.text.match(/\d+/)?.[0] ?? "1"}</Text>
      </View>
    );
  return <PersonPhoto item={item} size={72} />;
}

export function Slides({ tl, turn, items }: { tl: Timeline; turn: Turn | null; items: StoryItem[] }) {
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const kind = tl.style.caption;
  if (!turn || tl.style.format !== "slides") return null;
  const item = items.find((i) => i.name === turn.person);
  const body = turn.text !== turn.caption ? turn.text : "";
  const scale = width / 390;
  const enter = still ? undefined : kind === "launch-type" ? FadeIn.duration(260) : SlideInRight.duration(260);

  if (kind === "screen") {
    return (
      <Animated.View key={turn.index} entering={still ? undefined : FadeIn.duration(140)} style={{ position: "absolute", inset: 0, alignItems: "center" }} pointerEvents="none">
        <Text style={{ marginTop: height * 0.12, marginHorizontal: 24, fontSize: 28 * scale, fontWeight: "800", color: "#FFFFFF", textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }}>{turn.caption}</Text>
        <View style={{ marginTop: 28, width: width * 0.84, aspectRatio: 1.45, borderRadius: 18, borderCurve: "continuous", backgroundColor: "#1C1B22", padding: 10, boxShadow: "0 24px 40px -16px rgba(0,0,0,0.6)" }}>
          <View style={{ flex: 1, borderRadius: 10, backgroundColor: turn.index === 0 ? "#0E0D12" : "#F4F3FA", justifyContent: "center", padding: 16 }}>
            {item && (
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.8)", padding: 14, borderRadius: 18, borderCurve: "continuous", boxShadow: "0 12px 26px -16px rgba(27,22,64,0.3)" }}>
                <PersonPhoto item={item} size={44} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ fontWeight: "600", fontSize: 15, color: color.ink }}>{item.name}</Text>
                  <Text style={{ fontSize: 13.5, color: color.inkSecondary }}>{item.text}</Text>
                  <Text style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.2, color: color.inkQuiet, marginTop: 2 }}>{item.upcoming ? "COMING UP" : item.source.toUpperCase()}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
        {turn.index > 0 && !still && <Animated.View entering={FadeInDown.duration(260)} style={{ width: 8, height: 120, marginTop: -60, marginLeft: width * 0.3, borderRadius: 4, backgroundColor: "#F2C14E", transform: [{ rotate: "-28deg" }] }} />}
      </Animated.View>
    );
  }

  if (kind === "launch-type") {
    return (
      <View style={{ position: "absolute", inset: 0, justifyContent: "center", paddingHorizontal: 32, gap: 14 }} pointerEvents="none">
        {item && (
          <Animated.View key={"p" + turn.index} entering={enter}>
            <PersonPhoto item={item} size={46} />
          </Animated.View>
        )}
        <View key={"w" + turn.index} style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 10 }}>
          {splitWords(turn.caption).map((w, i) => (
            <Animated.Text key={i} entering={still ? undefined : FadeInDown.delay(i * 70).duration(380)} style={{ fontFamily: font.serif, fontSize: 40 * scale, lineHeight: 46 * scale, letterSpacing: -0.8, color: "#F4F3FA" }}>
              {w}
            </Animated.Text>
          ))}
        </View>
        {!!body && (
          <Animated.Text key={"b" + turn.index} entering={still ? undefined : FadeIn.delay(420).duration(400)} style={{ fontSize: 16, color: "rgba(244,243,250,0.6)" }}>
            {body}
          </Animated.Text>
        )}
      </View>
    );
  }

  const graphic = kind === "slide-graphic";
  const [a, b] = avatarColors(item?.hue ?? 250);
  const count = tl.turns.length;
  return (
    <Animated.View
      key={turn.index}
      entering={enter}
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        top: height * 0.14,
        aspectRatio: 4 / 5,
        borderRadius: 28,
        borderCurve: "continuous",
        overflow: "hidden",
        padding: 24,
        justifyContent: "space-between",
        backgroundColor: graphic ? "rgba(255,255,255,0.72)" : b,
        borderWidth: graphic ? 1 : 0,
        borderColor: color.cardEdge,
        boxShadow: "0 24px 40px -18px rgba(27,22,64,0.45)",
      }}
    >
      {!graphic && <View style={{ position: "absolute", inset: 0, backgroundColor: a, opacity: 0.55, transform: [{ rotate: "-12deg" }, { scale: 1.4 }, { translateY: -160 }] }} />}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: graphic ? color.inkQuiet : "rgba(27,26,34,0.6)" }}>{(item?.upcoming ? "COMING UP" : item?.source ?? "TODAY").toUpperCase()}</Text>
        <Text style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: graphic ? color.inkQuiet : "rgba(27,26,34,0.6)" }}>{turn.index + 1}/{count}</Text>
      </View>
      <View style={{ alignItems: "flex-start" }}>{item ? graphic ? <Graphic item={item} /> : <PersonPhoto item={item} size={96} /> : null}</View>
      <View style={{ gap: 10 }}>
        <Text style={graphic ? { fontFamily: font.serif, fontSize: 32 * scale, lineHeight: 36 * scale, letterSpacing: -0.6, color: color.ink } : { fontSize: 30 * scale, lineHeight: 34 * scale, fontWeight: "800", color: "#1B1A22", letterSpacing: -0.5 }}>{turn.caption}</Text>
        {!!body && <Text style={{ fontSize: 16, lineHeight: 22, color: graphic ? color.inkSecondary : "rgba(27,26,34,0.75)" }}>{body}</Text>}
      </View>
    </Animated.View>
  );
}
