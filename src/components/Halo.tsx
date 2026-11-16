import { Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useDerivedValue, useReducedMotion } from "react-native-reanimated";
import { haloSource } from "../shaders/sources";
import { hexToRgb } from "../shaders/oklab";

const effect = Skia.RuntimeEffect.Make(haloSource)!;

export function Halo({
  colors = ["#FF844F", "#F773A5"],
  cornerRadius = 24,
  inset = 0,
  loop = false,
  bleed = 24,
}: {
  colors?: [string, string];
  cornerRadius?: number;
  inset?: number;
  loop?: boolean;
  bleed?: number;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const clock = useClock();
  const still = useReducedMotion();
  const a = hexToRgb(colors[0]);
  const b = hexToRgb(colors[1]);
  const uniforms = useDerivedValue(() => ({
    resolution: [size.width, size.height],
    colorA: a,
    colorB: b,
    time: still ? 0 : clock.value / 1000,
    speed: 1,
    delay: 0.18,
    inset: inset + bleed,
    cornerRadius,
    loop: loop ? 1 : 0,
  }));
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);
  if (still) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { margin: -bleed }]} onLayout={onLayout} pointerEvents="none">
      {size.width > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      )}
    </View>
  );
}
