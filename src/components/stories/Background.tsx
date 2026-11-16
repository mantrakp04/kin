import { Canvas, Circle, Fill, Group, Path, RoundedRect, Shader, Skia, useClock, type SkRuntimeEffect } from "@shopify/react-native-skia";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useDerivedValue, useReducedMotion } from "react-native-reanimated";
import type { StoryStyle } from "../../../convex/storyStyles";
import { hexToRgb } from "../../shaders/oklab";
import { backdrops } from "../../theme/tokens";
import { Backdrop } from "../Backdrop";
import { DIM, sceneSource } from "./scenes";

const effects = new Map<string, SkRuntimeEffect>();
function effectFor(scene: Parameters<typeof sceneSource>[0]) {
  let effect = effects.get(scene);
  if (!effect) {
    effect = Skia.RuntimeEffect.Make(sceneSource(scene))!;
    effects.set(scene, effect);
  }
  return effect;
}

const BPM = { none: 100, beat101: 101, beat128: 128, pad: 70 } as const;

export function SceneBackground({ style, drop }: { style: StoryStyle; drop: boolean }) {
  const { width, height } = useWindowDimensions();
  const clock = useClock();
  const still = useReducedMotion();
  const { scene, palette } = style.background;
  const [c0, c1, c2] = palette.map(hexToRgb);
  const bpm = BPM[style.music];
  const dim = DIM[scene] ?? 1;
  const phase = drop ? 1 : 0;
  const uniforms = useDerivedValue(() => ({ res: [width, height], time: still ? 1.5 : clock.value / 1000, bpm, phase, dim, c0, c1, c2 }));
  const angle = useDerivedValue(() => (still || !drop ? 0 : clock.value / 70));
  const catTransform = useDerivedValue(() => [{ translateX: width / 2 }, { translateY: height * 0.5 }, { scaleX: Math.cos(angle.value) }]);
  if (scene === "brand") return <Backdrop colors={backdrops.app} />;
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={effectFor(scene)} uniforms={uniforms} />
      </Fill>
      {scene === "disco-cat" && (
        <Group transform={catTransform}>
          <RoundedRect x={-62} y={-10} width={124} height={130} r={52} color="#9A9AA2" />
          <Circle cx={0} cy={-46} r={58} color="#A7A7AF" />
          <Path path="M -52 -72 L -40 -128 L -10 -96 Z" color="#A7A7AF" />
          <Path path="M 52 -72 L 40 -128 L 10 -96 Z" color="#A7A7AF" />
          <RoundedRect x={-46} y={-62} width={92} height={24} r={10} color="#111114" />
          <Circle cx={0} cy={-26} r={6} color="#E8A0A8" />
          <RoundedRect x={-30} y={112} width={22} height={18} r={8} color="#8C8C94" />
          <RoundedRect x={8} y={112} width={22} height={18} r={8} color="#8C8C94" />
        </Group>
      )}
    </Canvas>
  );
}
