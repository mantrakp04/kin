import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { backdropSource } from "../../../shaders/sources";
import { oklab } from "../../../shaders/oklab";
import { hsl } from "../../../theme/tokens";

const effect = Skia.RuntimeEffect.Make(backdropSource)!;

export const tint = (hue: number) => hsl(hue, 0.55, 0.42);

export function CardGradient({ hue }: { hue: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const uniforms = useMemo(
    () => ({
      size: [size.width, size.height],
      tl: oklab(hsl(hue, 0.8, 0.85)),
      tr: oklab(hsl((hue + 28) % 360, 0.7, 0.9)),
      bl: oklab(hsl((hue + 340) % 360, 0.4, 0.955)),
      br: oklab(hsl((hue + 14) % 360, 0.35, 0.97)),
      mid: oklab(hsl(hue, 0.6, 0.93)),
      time: hue * 1.7,
      grain: 0.06,
    }),
    [hue, size.width, size.height],
  );
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
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
