import { Text, View } from "react-native";
import { color, shadow } from "../../theme/tokens";

export function CityPin({ name, count, size, selected }: { name: string; count: number; size: number; selected: boolean }) {
  return (
    <View style={{ width: size, height: size, overflow: "visible" }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: selected ? color.accent : color.ink,
          borderWidth: 2,
          borderColor: color.white,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: shadow.lg,
        }}
      >
        <Text style={{ color: color.white, fontSize: Math.max(11, size * 0.36), fontWeight: "600", fontVariant: ["tabular-nums"] }}>{count}</Text>
      </View>
      <Text
        numberOfLines={1}
        style={{
          position: "absolute",
          left: size + 6,
          top: size / 2 - 9,
          width: 120,
          fontSize: 12.5,
          lineHeight: 18,
          fontWeight: "600",
          color: selected ? color.accent : color.ink,
          textShadowColor: "rgba(255,255,255,0.95)",
          textShadowRadius: 3,
          textShadowOffset: { width: 0, height: 0 },
        }}
      >
        {name}
      </Text>
    </View>
  );
}
