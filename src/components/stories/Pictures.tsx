import { LinearGradient } from "expo-linear-gradient";
import { Image, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { avatarColors } from "../../theme/tokens";
import { Avatar } from "../ui";
import type { StoryItem } from "./types";
import type { Timeline, Turn } from "./timeline";

export function PersonPhoto({ item, size }: { item: StoryItem; size: number }) {
  return item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <Avatar name={item.name} hue={item.hue} size={size} />;
}

const TOP = new Set(["yellow-highlight", "reddit", "bold-italic", "subtitle"]);
const company = (text: string) => text.match(/\bat ([A-Z][\w&.'-]*(?: [A-Z][\w&.'-]*)*)/)?.[1];
const city = (text: string) => text.match(/\b(?:in|to|Visiting|from|Place:) ([A-Z][\w]+(?: [A-Z][\w]+)*)/)?.[1];
const stat = (text: string) => text.match(/\d+(?::\d+)+|\d+(?:\.\d+)?\s?(?:miles|km|k)\b/i)?.[0];

function seeded(s: string, n: number) {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return Array.from({ length: n }, (_, i) => ((h * (i + 3) * 7919) % 100) / 100);
}

function Label({ children }: { children: string }) {
  return <Text style={{ marginTop: 8, fontSize: 15, fontWeight: "800", color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 5, textAlign: "center" }}>{children}</Text>;
}

function UpdateArt({ item, size }: { item: StoryItem; size: number }) {
  const [a, b] = avatarColors(item.hue);
  const place = city(item.text);
  if (item.kind === "job") {
    const name = company(item.text) ?? "New job";
    return (
      <View style={{ alignItems: "center" }}>
        <View style={{ width: size * 0.6, height: size * 0.6, borderRadius: size * 0.16, borderCurve: "continuous", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 24px -10px rgba(0,0,0,0.5)" }}>
          <LinearGradient colors={[a, b]} style={{ position: "absolute", inset: 10, borderRadius: size * 0.12 }} />
          <Text style={{ fontSize: size * 0.32, fontWeight: "900", color: "#1B1A22" }}>{name.slice(0, 1)}</Text>
        </View>
        <Label>{name}</Label>
      </View>
    );
  }
  if ((item.kind === "trip" || item.kind === "move") && place) {
    const heights = seeded(place, 9);
    return (
      <View style={{ alignItems: "center" }}>
        <LinearGradient colors={["#FFB36B", "#F773A5", "#6D4BD8"]} style={{ width: size, height: size * 0.62, borderRadius: 22, borderCurve: "continuous", overflow: "hidden", justifyContent: "flex-end", flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, gap: 3 }}>
          <View style={{ position: "absolute", top: size * 0.1, left: size * 0.62, width: size * 0.16, height: size * 0.16, borderRadius: size, backgroundColor: "#FFE9B0" }} />
          {heights.map((h, i) => (
            <View key={i} style={{ flex: 1, height: size * (0.14 + h * 0.36), backgroundColor: "#24183F", borderTopLeftRadius: i % 3 === 0 ? 8 : 2, borderTopRightRadius: 2 }} />
          ))}
        </LinearGradient>
        <Label>{(item.kind === "move" ? "Now in " : "") + place}</Label>
      </View>
    );
  }
  const number = stat(item.text);
  if (number)
    return (
      <View style={{ alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: 14, marginBottom: -10, zIndex: 0 }}>
          <View style={{ width: 18, height: 40, backgroundColor: "#3139FB", transform: [{ rotate: "18deg" }] }} />
          <View style={{ width: 18, height: 40, backgroundColor: "#F25C54", transform: [{ rotate: "-18deg" }] }} />
        </View>
        <View style={{ width: size * 0.62, height: size * 0.62, borderRadius: size, backgroundColor: "#F4C542", borderWidth: 6, borderColor: "#E0A82E", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 24px -10px rgba(0,0,0,0.5)" }}>
          <Text style={{ fontSize: size * 0.15, fontWeight: "900", color: "#5A3B00" }}>{number}</Text>
        </View>
      </View>
    );
  if (item.kind === "birthday")
    return (
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 6, height: 26, backgroundColor: "#FFFFFF", borderRadius: 3 }} />
        <View style={{ width: 14, height: 18, marginTop: -40, marginBottom: 22, borderRadius: 8, backgroundColor: "#FFB13B" }} />
        <View style={{ width: size * 0.5, height: size * 0.18, backgroundColor: "#FFD6E0", borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 3, borderColor: "#1B1A22" }} />
        <View style={{ width: size * 0.7, height: size * 0.24, backgroundColor: "#F773A5", borderRadius: 14, borderWidth: 3, borderColor: "#1B1A22", marginTop: -3 }} />
        <Label>{item.text.replace(/\.$/, "")}</Label>
      </View>
    );
  if (item.kind === "event")
    return (
      <View style={{ alignItems: "center" }}>
        <View style={{ width: size, height: size * 0.42, borderRadius: 16, borderCurve: "continuous", backgroundColor: "#FFF6D8", borderWidth: 3, borderColor: "#1B1A22", flexDirection: "row", overflow: "hidden" }}>
          <View style={{ width: size * 0.26, backgroundColor: "#F25C54", borderRightWidth: 3, borderStyle: "dashed", borderColor: "#1B1A22" }} />
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: "#1B1A22" }}>ADMIT ONE</Text>
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "900", color: "#1B1A22" }}>{place ?? "Tonight"}</Text>
          </View>
        </View>
      </View>
    );
  return null;
}

export function Pictures({ tl, turn, t, items }: { tl: Timeline; turn: Turn | null; t: number; items: StoryItem[] }) {
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const kind = tl.style.caption;
  if (tl.style.format === "slides") return null;
  if (kind === "reddit" && t < 5) return null;
  const item = turn?.person ? items.find((i) => i.name === turn.person) : undefined;
  if (!item) return null;
  const top = TOP.has(kind);
  const enter = still ? undefined : FadeIn.duration(160);
  return (
    <>
      <Animated.View
        key={"chip:" + item.name}
        entering={enter}
        exiting={FadeOut.duration(120)}
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 16,
          right: top ? 16 : undefined,
          top: top ? height * 0.1 : undefined,
          bottom: top ? undefined : 110,
          maxWidth: top ? undefined : width * 0.78,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 10,
          paddingRight: 16,
          borderRadius: 22,
          borderCurve: "continuous",
          backgroundColor: "rgba(255,255,255,0.94)",
          boxShadow: "0 12px 24px -12px rgba(0,0,0,0.45)",
        }}
      >
        <PersonPhoto item={item} size={40} />
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: "#1B1A22" }}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 13, color: "rgba(27,26,34,0.72)" }}>
            {item.text}
          </Text>
        </View>
        <Text style={{ marginLeft: "auto", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "rgba(27,26,34,0.5)", fontFamily: "ui-monospace" }}>{item.upcoming ? "Soon" : item.source}</Text>
      </Animated.View>
      {top && (
        <Animated.View key={"art:" + item.name} entering={enter} exiting={FadeOut.duration(120)} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: height * 0.21, height: height * 0.24, alignItems: "center", justifyContent: "center" }}>
          <UpdateArt item={item} size={Math.min(width * 0.56, height * 0.2)} />
        </Animated.View>
      )}
    </>
  );
}
