import { GlassContainer, GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { router } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { useEffect } from "react";
import { Text, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius, shadow } from "../theme/tokens";
import { springs } from "../theme/motion";
import { Press } from "./Press";

const LABELS: Record<string, string> = { index: "Today", people: "People", map: "Map" };
const TAB_W = 76;
const H = 40;
const PAD = 5;
const glass = isLiquidGlassAvailable();

const fallbackBar: ViewStyle = { backgroundColor: "rgba(252,252,252,0.86)", borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.dock };
const fallbackPill: ViewStyle = { backgroundColor: color.ink };
const fallbackPlus: ViewStyle = { backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.dock };

export function Dock({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const x = useSharedValue(state.index * TAB_W);
  useEffect(() => {
    x.value = withSpring(state.index * TAB_W, springs.pill);
  }, [state.index]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const barShape: ViewStyle = { flexDirection: "row", padding: PAD, borderRadius: radius.capsule, borderCurve: "continuous" };
  const plusShape: ViewStyle = { width: H + PAD * 2, height: H + PAD * 2, borderRadius: (H + PAD * 2) / 2, alignItems: "center", justifyContent: "center" };
  const pillShape: ViewStyle = { position: "absolute", width: TAB_W, height: H, borderRadius: radius.capsule, borderCurve: "continuous" };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 8, alignItems: "center" }}>
      <GlassContainer spacing={14} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <GlassView isInteractive glassEffectStyle="regular" style={[barShape, !glass && fallbackBar]}>
          <View style={{ flexDirection: "row" }}>
            <Animated.View style={[pillShape, pill]}>
              {glass ? (
                <GlassView glassEffectStyle="regular" tintColor="rgba(27,26,34,0.82)" style={{ flex: 1, borderRadius: radius.capsule }} />
              ) : (
                <View style={[{ flex: 1, borderRadius: radius.capsule }, fallbackPill]} />
              )}
            </Animated.View>
            {state.routes.map((route, i) => {
              const focused = state.index === i;
              return (
                <Press
                  key={route.key}
                  testID={`tab-${route.name}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={LABELS[route.name]}
                  haptic
                  onPress={() => {
                    if (!focused) navigateToTab(route.key);
                  }}
                  style={{ width: TAB_W, height: H, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: focused ? color.white : color.inkSecondary }}>{LABELS[route.name]}</Text>
                </Press>
              );
            })}
          </View>
        </GlassView>
        <GlassView isInteractive glassEffectStyle="regular" style={[plusShape, !glass && fallbackPlus]}>
          <Press
            testID="dock-plus"
            accessibilityRole="button"
            accessibilityLabel="New update"
            haptic
            scale={0.94}
            onPress={() => router.push("/share")}
            style={{ width: H + PAD * 2, height: H + PAD * 2, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 24, lineHeight: 26, color: color.ink, fontWeight: "300" }}>+</Text>
          </Press>
        </GlassView>
      </GlassContainer>
    </View>
  );
}

export function useDockHeight() {
  const insets = useSafeAreaInsets();
  return insets.bottom + 8 + H + PAD * 2 + 24;
}
