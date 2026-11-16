import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { Avatar } from "../ui";

const PEOPLE = [
  { name: "Priya Shah", hue: 18, x: 0.08, y: 0.1, size: 54, drift: 9, ms: 5200 },
  { name: "Jonah Lee", hue: 205, x: 0.62, y: 0.04, size: 64, drift: 12, ms: 6100 },
  { name: "Sofia Ruiz", hue: 330, x: 0.38, y: 0.3, size: 72, drift: 10, ms: 5600 },
  { name: "Theo Park", hue: 140, x: 0.8, y: 0.34, size: 46, drift: 8, ms: 4800 },
  { name: "Amara Okafor", hue: 265, x: 0.04, y: 0.48, size: 60, drift: 11, ms: 6600 },
  { name: "Lena Fischer", hue: 45, x: 0.56, y: 0.62, size: 52, drift: 9, ms: 5000 },
  { name: "Marcus Hill", hue: 180, x: 0.24, y: 0.74, size: 44, drift: 7, ms: 5800 },
  { name: "Noor Haddad", hue: 300, x: 0.82, y: 0.78, size: 40, drift: 8, ms: 4600 },
];

function Bubble({ p, index, width, height }: { p: (typeof PEOPLE)[number]; index: number; width: number; height: number }) {
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    t.value = withDelay(index * 180, withRepeat(withTiming(1, { duration: p.ms, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [still]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (t.value - 0.5) * p.drift * 2 }, { translateX: (t.value - 0.5) * p.drift * (index % 2 ? 1 : -1) }],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: p.x * width, top: p.y * height, opacity: 0.92, borderRadius: p.size / 2, boxShadow: "0 0 0 4px rgba(255,255,255,0.1), 0 12px 30px -8px rgba(9,0,80,0.5)" },
        style,
      ]}
    >
      <Avatar name={p.name} hue={p.hue} size={p.size} />
    </Animated.View>
  );
}

export function Bubbles({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" style={{ width, height }}>
      {PEOPLE.map((p, i) => (
        <Bubble key={p.name} p={p} index={i} width={width - p.size} height={height - p.size} />
      ))}
    </View>
  );
}
