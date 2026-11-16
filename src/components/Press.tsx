import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { press, springs } from "../theme/motion";

export function Press({
  children,
  style,
  scale = press.control,
  haptic = false,
  ...rest
}: Omit<PressableProps, "style" | "children"> & { children: ReactNode; style?: StyleProp<ViewStyle>; scale?: number; haptic?: boolean }) {
  const s = useSharedValue(1);
  const still = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (!still) s.value = withSpring(scale, springs.snappy);
        if (haptic) Haptics.selectionAsync();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, springs.snappy);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}
