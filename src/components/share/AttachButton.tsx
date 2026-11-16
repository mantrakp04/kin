import { Text, View } from "react-native";
import { Press } from "../Press";
import { radius } from "../../theme/tokens";
import { dark } from "./dark";

export function AttachButton({ label, glyph, active, onPress, testID }: { label: string; glyph: string; active?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Press
      testID={testID}
      haptic
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        height: 40,
        paddingHorizontal: 16,
        borderRadius: radius.capsule,
        borderCurve: "continuous",
        backgroundColor: active ? dark.surfaceActive : dark.surface,
        borderWidth: 1,
        borderColor: active ? dark.edgeActive : dark.edge,
        boxShadow: dark.shadow,
      }}
    >
      <View style={{ width: 18, alignItems: "center" }}>
        <Text style={{ color: dark.secondary, fontSize: 15 }}>{glyph}</Text>
      </View>
      <Text style={{ color: dark.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Press>
  );
}
