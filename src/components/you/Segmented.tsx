import { Text, View } from "react-native";
import { Press } from "../Press";
import { color, radius } from "../../theme/tokens";

export function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (key: string) => void }) {
  return (
    <View style={{ flexDirection: "row", padding: 3, gap: 3, borderRadius: radius.capsule, borderCurve: "continuous", backgroundColor: "rgba(27,26,34,0.05)", alignSelf: "flex-start" }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            testID={`demo-user-${o.key}`}
            haptic
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.key)}
            style={{ height: 30, paddingHorizontal: 14, borderRadius: radius.capsule, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: on ? color.ink : "transparent" }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: on ? color.white : color.inkSecondary }}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}
