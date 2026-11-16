import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Press } from "../Press";
import { color, radius } from "../../theme/tokens";
import { springs } from "../../theme/motion";
import { dark } from "./dark";

export function AudienceRow({ label, detail, selected, onPress, testID }: { label: string; detail: string; selected: boolean; onPress: () => void; testID: string }) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(selected ? 1 : 0, springs.smooth);
  }, [selected]);
  const fill = useAnimatedStyle(() => ({ opacity: on.value }));
  const check = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.6 + on.value * 0.4 }] }));
  return (
    <Press
      testID={testID}
      haptic
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${detail}`}
      style={{ borderRadius: radius.row + 4, borderCurve: "continuous" }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.row + 4, borderCurve: "continuous", backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.edge, boxShadow: dark.shadow },
          fill,
        ]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: dark.text, fontSize: 15.5, fontWeight: "600" }}>{label}</Text>
          <Text style={{ color: dark.quiet, fontSize: 13.5 }}>{detail}</Text>
        </View>
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: selected ? "transparent" : dark.edge, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: dark.text, alignItems: "center", justifyContent: "center" }, check]}>
            <Text style={{ color: color.sheetDark, fontSize: 13, fontWeight: "700" }}>✓</Text>
          </Animated.View>
        </View>
      </View>
    </Press>
  );
}
