import { Switch, Text, View } from "react-native";
import { color, type } from "../../theme/tokens";

export function ToggleRow({ label, detail, value, onChange, testID }: { label: string; detail: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.rowName}>{label}</Text>
        <Text style={type.quiet}>{detail}</Text>
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.accent, false: color.hairline }}
        ios_backgroundColor={color.hairline}
      />
    </View>
  );
}
