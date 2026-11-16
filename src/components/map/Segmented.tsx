import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Press } from "../Press";
import { springs } from "../../theme/motion";
import { color, radius, shadow } from "../../theme/tokens";

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string; testID: string }>; value: T; onChange: (v: T) => void }) {
  const [width, setWidth] = useState(0);
  const seg = width / options.length;
  const index = options.findIndex((o) => o.value === value);
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(index * seg, springs.pill);
  }, [index, seg]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - 8)}
      style={{ flexDirection: "row", padding: 4, borderRadius: radius.capsule, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.lg }}
    >
      {width > 0 && <Animated.View style={[{ position: "absolute", top: 4, left: 4, width: seg, height: 34, borderRadius: radius.capsule, backgroundColor: color.ink }, pill]} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <View key={o.value} style={{ flex: 1 }}>
          <Press
            testID={o.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            haptic
            onPress={() => onChange(o.value)}
            style={{ flex: 1, height: 34, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: on ? color.white : color.inkSecondary }}>{o.label}</Text>
          </Press>
          </View>
        );
      })}
    </View>
  );
}
