import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { StoryItem } from "./types";
import type { Timeline, Turn, Word } from "./timeline";

const CONDENSED = Platform.select({ ios: "AvenirNextCondensed-Heavy", default: "sans-serif-condensed" });
const YELLOW = "#FFE83B";

export function Outlined({ children, style, width = 2.5, color = "#000" }: { children: ReactNode; style: TextStyle; width?: number; color?: string }) {
  const d = width;
  const offsets = [[-d, 0], [d, 0], [0, -d], [0, d], [-d * 0.7, -d * 0.7], [d * 0.7, d * 0.7], [-d * 0.7, d * 0.7], [d * 0.7, -d * 0.7]];
  return (
    <View>
      {offsets.map(([x, y], i) => (
        <Text key={i} accessible={false} style={[style, { position: "absolute", left: x, right: -x, top: y, color }]}>
          {children}
        </Text>
      ))}
      <Text style={style}>{children}</Text>
    </View>
  );
}

function phrases(words: Word[], max: number) {
  const out: { words: Word[]; first: number }[] = [];
  words.forEach((w, i) => {
    const last = out[out.length - 1];
    if (!last || last.words.length >= max || /[.,!?;:]$/.test(last.words[last.words.length - 1].w)) out.push({ words: [w], first: i });
    else last.words.push(w);
  });
  return out;
}

function activeIndex(turn: Turn, t: number) {
  let k = -1;
  turn.words.forEach((w, i) => {
    if (w.s <= t) k = i;
  });
  return k;
}

const live = (turn: Turn | null, t: number, grace = 0.35): turn is Turn => !!turn && t <= turn.end + grace;

function Highlight({ turn, t, ink, size, top }: { turn: Turn; t: number; ink: string; size: number; top: number }) {
  const k = activeIndex(turn, t);
  const groups = phrases(turn.words, 4);
  const group = groups.find((g) => k >= g.first && k < g.first + g.words.length) ?? groups[0];
  const style: TextStyle = { fontFamily: CONDENSED, fontWeight: "900", fontSize: size, color: ink, letterSpacing: 0.2 };
  return (
    <View pointerEvents="none" style={[styles.band, { top, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }]}>
      {group.words.map((w, i) => {
        const on = group.first + i === k && t <= w.e + 0.25;
        return (
          <View key={group.first + i} style={{ paddingHorizontal: size * 0.16, paddingVertical: size * 0.04, borderRadius: size * 0.2, borderCurve: "continuous", backgroundColor: on ? "#FFFFFF" : "transparent" }}>
            {on ? <Text style={[style, { color: "#000" }]}>{w.w}</Text> : <Outlined style={style} width={size * 0.07}>{w.w}</Outlined>}
          </View>
        );
      })}
    </View>
  );
}

function Reddit({ turn, t, size, top, names }: { turn: Turn; t: number; size: number; top: number; names: Set<string> }) {
  const k = activeIndex(turn, t);
  const groups = phrases(turn.words, 3);
  const group = groups.find((g) => k >= g.first && k < g.first + g.words.length) ?? groups[0];
  return (
    <View pointerEvents="none" style={[styles.band, { top, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: size * 0.25 }]}>
      {group.words.map((w, i) => (
        <Outlined key={group.first + i} width={size * 0.08} style={{ fontSize: size, fontWeight: "900", color: names.has(w.w.replace(/[^A-Za-z]/g, "").replace(/s$/, "")) || names.has(w.w.replace(/[^A-Za-z]/g, "")) ? YELLOW : "#FFFFFF" }}>
          {w.w}
        </Outlined>
      ))}
    </View>
  );
}

function RedditCard({ title, scale }: { title: string; scale: number }) {
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut} pointerEvents="none" style={{ position: "absolute", top: "16%", left: 28, right: 28, backgroundColor: "#FFFFFF", borderRadius: 18, borderCurve: "continuous", padding: 16 * scale, gap: 10, boxShadow: "0 12px 30px -10px rgba(0,0,0,0.5)" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#FF4500" }} />
        <View>
          <Text style={{ fontWeight: "700", fontSize: 14, color: "#1A1A1B" }}>r/mypeople</Text>
          <Text style={{ fontSize: 12, color: "#787C7E" }}>u/me · just now</Text>
        </View>
      </View>
      <Text style={{ fontWeight: "700", fontSize: 19 * scale, lineHeight: 24 * scale, color: "#1A1A1B" }}>{title}</Text>
      <Text style={{ fontSize: 12.5, color: "#787C7E", fontWeight: "600" }}>▲ 4.2k   ·   312 comments</Text>
    </Animated.View>
  );
}

function OverlayLines({ lines, size, top, center }: { lines: string[]; size: number; top?: number; center?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.band, center ? { top: 0, bottom: 0, justifyContent: "center" } : { top }]}>
      {lines.map((line, i) =>
        line.trim() ? (
          <Outlined key={i} width={size * 0.09} style={{ fontSize: size, lineHeight: size * 1.18, fontWeight: "600", color: "#FFFFFF", textAlign: "center" }}>
            {line}
          </Outlined>
        ) : (
          <View key={i} style={{ height: size * 0.9 }} />
        ),
      )}
    </View>
  );
}

export function Captions({ tl, t, turn, items }: { tl: Timeline; t: number; turn: Turn | null; items: StoryItem[] }) {
  const { width, height } = useWindowDimensions();
  const scale = width / 390;
  const kind = tl.style.caption;

  if (kind === "yellow-highlight") return live(turn, t) ? <Highlight turn={turn} t={t} ink={YELLOW} size={44 * scale} top={height * 0.4} /> : null;
  if (kind === "white-highlight") return live(turn, t) ? <Highlight turn={turn} t={t} ink="#FFFFFF" size={36 * scale} top={height * 0.18} /> : null;
  if (kind === "reddit") {
    const names = new Set(items.map((i) => i.name.split(" ")[0]));
    return (
      <>
        {t < 5 && <RedditCard title={tl.title} scale={scale} />}
        {live(turn, t) && <Reddit turn={turn} t={t} size={34 * scale} top={t < 5 ? height * 0.52 : height * 0.36} names={names} />}
      </>
    );
  }
  if (kind === "bold-italic")
    return live(turn, t) ? (
      <Animated.View key={turn.index} entering={FadeIn.duration(120)} pointerEvents="none" style={[styles.band, { top: height * 0.7 }]}>
        <Outlined width={2.5 * scale} style={{ fontSize: 27 * scale, lineHeight: 33 * scale, fontWeight: "900", fontStyle: "italic", color: "#FFFFFF", textAlign: "center" }}>
          {turn.caption}
        </Outlined>
      </Animated.View>
    ) : null;
  if (kind === "phonetic") {
    const drop = turn?.beat === "drop";
    const k = turn ? activeIndex(turn, t) : -1;
    return (
      <>
        <OverlayLines lines={[drop ? (tl.overlay[1] ?? "") : (tl.overlay[0] ?? "")]} size={23 * scale} top={height * 0.24} />
        {live(turn, t, 0.6) && (
          <View pointerEvents="none" style={[styles.band, { top: height * 0.86 }]}>
            <Text style={{ fontSize: 30 * scale, color: "#111", letterSpacing: 6, fontWeight: "500", textAlign: "center" }}>{turn.words.slice(0, k + 1).map((w) => w.w).join(" ")}</Text>
          </View>
        )}
      </>
    );
  }
  if (kind === "subtitle")
    return live(turn, t) ? (
      <View pointerEvents="none" style={[styles.band, { top: height * 0.7, gap: 6 }]}>
        <Text style={{ alignSelf: "center", fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: "rgba(255,255,255,0.9)", textTransform: "uppercase", backgroundColor: "rgba(0,0,0,0.35)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" }}>
          {tl.names[turn.speaker] ?? turn.speaker}
        </Text>
        <Outlined width={1.6 * scale} style={{ fontSize: 24 * scale, lineHeight: 30 * scale, fontWeight: "700", color: "#FFFFFF", textAlign: "center" }}>
          {turn.caption}
        </Outlined>
      </View>
    ) : null;
  if (kind === "hook") return <OverlayLines lines={tl.overlay} size={24 * scale} top={height * 0.1} />;
  if (kind === "timed-hook")
    return turn ? (
      <Animated.View key={turn.index} entering={FadeIn.duration(160)} pointerEvents="none" style={[styles.band, { top: height * 0.13 }]}>
        <Outlined width={2.4 * scale} style={{ fontSize: 30 * scale, lineHeight: 36 * scale, fontWeight: "800", color: "#FFFFFF", textAlign: "center" }}>
          {turn.caption}
        </Outlined>
      </Animated.View>
    ) : null;
  if (kind === "block-cream")
    return (
      <View pointerEvents="none" style={[styles.band, { top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 30 }]}>
        <Text style={{ fontSize: 20 * scale, lineHeight: 25 * scale, fontWeight: "500", color: "#FFF6D8", textAlign: "center" }}>{tl.overlay.join(" ")}</Text>
      </View>
    );
  if (kind === "block-white") return <OverlayLines lines={tl.overlay} size={22 * scale} center />;
  return null;
}

const styles = StyleSheet.create({
  band: { position: "absolute", left: 22, right: 22, alignItems: "center" },
});
