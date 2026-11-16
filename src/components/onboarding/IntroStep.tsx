import { useEffect } from "react";
import { Text, View } from "react-native";
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Enter } from "../Enter";
import { font } from "../../theme/tokens";
import { springs } from "../../theme/motion";
import { light } from "./light";

const THRESHOLD = 140;

export function IntroStep({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const y = useSharedValue(0);
  const breath = useSharedValue(0);
  const leaving = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    breath.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [still]);

  const advance = () => {
    "worklet";
    if (leaving.value) return;
    leaving.value = 1;
    y.value = withSpring(-420, springs.smooth);
    scheduleOnRN(onDone);
  };

  const pan = usePanGesture({
    minDistance: 6,
    onUpdate: (e) => {
      "worklet";
      if (leaving.value) return;
      const t = e.translationY;
      y.value = t < 0 ? t : t * 0.2;
    },
    onDeactivate: (e) => {
      "worklet";
      if (leaving.value) return;
      if (e.translationY < -THRESHOLD || e.velocityY < -900) advance();
      else y.value = withSpring(0, springs.bouncy);
    },
    onFinalize: () => {
      "worklet";
      if (!leaving.value) y.value = withSpring(0, springs.bouncy);
    },
  });
  const tap = useTapGesture({
    onActivate: () => {
      "worklet";
      advance();
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const dot = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: 1 + breath.value * 0.08 + interpolate(-y.value, [0, THRESHOLD], [0, 0.25], "clamp") }],
  }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.35 + breath.value * 0.4, transform: [{ scale: 1 + breath.value * 0.35 }] }));
  const hint = useAnimatedStyle(() => ({ opacity: interpolate(-y.value, [0, THRESHOLD * 0.6], [1, 0], "clamp") }));
  const line = useAnimatedStyle(() => ({ opacity: interpolate(-y.value, [0, 420], [1, 0.2], "clamp") }));

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[{ flex: 1, justifyContent: "center", paddingHorizontal: 28 }, line]}>
        <Enter index={0}>
          <Text style={{ fontFamily: font.serif, fontSize: 44, lineHeight: 50, letterSpacing: -0.9, color: light.text }}>Your people are out there.</Text>
        </Enter>
      </Animated.View>
      <View style={{ alignItems: "center", paddingBottom: insets.bottom + 36, gap: 22 }}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            testID="intro-dot"
            accessible
            accessibilityRole="button"
            accessibilityLabel="Continue"
            accessibilityHint="Drag the light up, or double tap"
            onAccessibilityTap={onDone}
            hitSlop={30}
            style={[{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }, dot]}
          >
            <Animated.View style={[{ position: "absolute", width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.12)", boxShadow: "0 0 40px 18px rgba(255,255,255,0.18)" }, halo]} />
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: light.text, boxShadow: light.glow }} />
          </Animated.View>
        </GestureDetector>
        <Animated.Text style={[{ color: light.quiet, fontSize: 13.5, letterSpacing: 0.2 }, hint]}>Drag the light up</Animated.Text>
      </View>
    </View>
  );
}
