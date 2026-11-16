import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { duration, ease, enter } from "../theme/motion";

export function Enter({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const still = useReducedMotion();
  const entering = still
    ? undefined
    : FadeInDown.duration(duration.enter)
        .delay(index * enter.stagger)
        .easing(ease)
        .withInitialValues({ opacity: 0, transform: [{ translateY: enter.rise }] });
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
