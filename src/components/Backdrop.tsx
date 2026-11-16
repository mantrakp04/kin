import { Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useDerivedValue, useReducedMotion } from "react-native-reanimated";
import { backdropSource } from "../shaders/sources";
import { oklab } from "../shaders/oklab";
import type { BackdropColors } from "../theme/tokens";

const effect = Skia.RuntimeEffect.Make(backdropSource)!;

export function Backdrop({ colors, grain = 0.07 }: { colors: BackdropColors; grain?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const clock = useClock();
  const still = useReducedMotion();
  const lab = useMemo(
    () => ({ tl: oklab(colors.tl), tr: oklab(colors.tr), bl: oklab(colors.bl), br: oklab(colors.br), mid: oklab(colors.mid) }),
    [colors.tl, colors.tr, colors.bl, colors.br, colors.mid],
  );
  const uniforms = useDerivedValue(() => ({
    size: [size.width, size.height],
    ...lab,
    time: still ? 0 : clock.value / 1000,
    grain,
  }));
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
