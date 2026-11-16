import { Blur, Canvas, Circle, Group, useClock } from "@shopify/react-native-skia";
import { useEffect } from "react";
import { interpolateColor, useDerivedValue, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, ease } from "../../theme/motion";

const LOBES = [
  { phase: 0, speed: 0.9, orbit: 0.22, size: 0.3 },
  { phase: 2.1, speed: 1.2, orbit: 0.18, size: 0.26 },
  { phase: 4.2, speed: 0.7, orbit: 0.2, size: 0.28 },
];

const PAD = 0.75;

function Lobe({ lobe, size, t, tint }: { lobe: (typeof LOBES)[number]; size: number; t: { value: number }; tint: { value: string } }) {
  const c = size / 2 + size * PAD;
  const cx = useDerivedValue(() => c + Math.cos(t.value * lobe.speed + lobe.phase) * size * lobe.orbit * (0.7 + 0.3 * Math.sin(t.value * 0.6)));
  const cy = useDerivedValue(() => c + Math.sin(t.value * lobe.speed * 1.1 + lobe.phase) * size * lobe.orbit);
  const r = useDerivedValue(() => size * lobe.size * (0.9 + 0.12 * Math.sin(t.value * 1.4 + lobe.phase)));
  return <Circle cx={cx} cy={cy} r={r} color={tint} />;
}

export function Orb({ size, colors, index }: { size: number; colors: readonly string[]; index: number }) {
  const clock = useClock();
  const still = useReducedMotion();
  const progress = useSharedValue(index);
  useEffect(() => {
    progress.value = still ? index : withTiming(index, { duration: duration.enter, easing: ease });
  }, [index, still]);
  const t = useDerivedValue(() => (still ? 0 : clock.value / 1000));
  const tint = useDerivedValue(() => interpolateColor(progress.value, colors.map((_, i) => i), colors as string[]));
  const coreR = useDerivedValue(() => size * (0.2 + 0.015 * Math.sin(t.value * 2)));
  const c = size / 2 + size * PAD;
  const full = size * (1 + PAD * 2);
  return (
    <Canvas style={{ width: full, height: full, margin: -size * PAD }} pointerEvents="none">
      <Group opacity={0.85}>
        <Blur blur={size * 0.11} />
        {LOBES.map((l, i) => (
          <Lobe key={i} lobe={l} size={size} t={t} tint={tint} />
        ))}
      </Group>
      <Group opacity={0.9}>
        <Blur blur={size * 0.06} />
        <Circle cx={c} cy={c} r={coreR} color="rgba(255,255,255,0.75)" />
      </Group>
    </Canvas>
  );
}
