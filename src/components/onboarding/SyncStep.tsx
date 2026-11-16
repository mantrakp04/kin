import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, space, type } from "../../theme/tokens";
import { Orb } from "./Orb";
import { SOURCES, light } from "./light";

const TOTAL_MS = 10000;
const STEP_MS = TOTAL_MS / SOURCES.length;
const MATCHED = 268;
const CONTACTS = 412;
const HOLD_MS = 1800;
const COLORS = SOURCES.map((s) => s.color);

export function SyncStep({ onStep, onDone }: { onStep: (index: number) => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  const finished = useRef(false);
  const done = elapsed >= TOTAL_MS;
  const index = Math.min(SOURCES.length - 1, Math.floor(elapsed / STEP_MS));
  const progress = Math.min(1, elapsed / TOTAL_MS);
  const count = Math.round(MATCHED * (1 - Math.pow(1 - progress, 2.2)));

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const t = Date.now() - start;
      setElapsed(t);
      if (t >= TOTAL_MS + HOLD_MS && !finished.current) {
        finished.current = true;
        clearInterval(id);
        onDone();
      }
    }, 60);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    onStep(index);
  }, [index]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28, paddingHorizontal: 28 }}>
      <Text style={[type.label, { color: light.quiet }]}>{done ? "Synced" : `Step ${index + 1} of ${SOURCES.length}`}</Text>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 280, height: 280, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute" }}>
            <Orb size={280} colors={COLORS} index={done ? SOURCES.length - 1 : index} />
          </View>
          <Text testID="sync-count" style={{ fontFamily: font.serif, fontSize: 72, letterSpacing: -2, color: light.text, fontVariant: ["tabular-nums"] }}>{count}</Text>
        </View>
        <Text style={{ color: light.secondary, fontSize: 15, marginTop: space.sm }}>people matched of {CONTACTS}</Text>
      </View>

      <View style={{ minHeight: 56, justifyContent: "flex-end" }}>
        {done ? (
          <Animated.Text key="done" testID="sync-done" entering={FadeInDown.duration(400)} style={{ fontFamily: font.serif, fontSize: 30, letterSpacing: -0.5, color: light.text }}>
            Done. 7 updates today.
          </Animated.Text>
        ) : (
          <Animated.Text key={SOURCES[index].key} entering={FadeIn.duration(300)} exiting={FadeOut.duration(150)} style={{ color: light.text, fontSize: 16.5, lineHeight: 23 }}>
            {SOURCES[index].status}
          </Animated.Text>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 6, marginTop: space.xl }}>
        {SOURCES.map((s, i) => {
          const state = done || i < index ? "done" : i === index ? "active" : "todo";
          return (
            <View key={s.key} style={{ flex: 1, gap: 8 }}>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: state === "todo" ? light.faint : state === "active" ? light.secondary : light.text }} />
              <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: "600", color: state === "todo" ? light.quiet : light.text }}>{s.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
