import { Text, TextInput, View, type TextInputProps } from "react-native";
import { color, radius, shadow, space, type } from "../../theme/tokens";

export function Field({ label, hint, multiline, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.rowName, { fontSize: 14 }]}>{label}</Text>
      <TextInput
        placeholderTextColor={color.inkQuiet}
        multiline={multiline}
        {...props}
        style={{
          minHeight: multiline ? 76 : 44,
          paddingHorizontal: space.md,
          paddingTop: multiline ? 11 : 0,
          paddingBottom: multiline ? 11 : 0,
          fontSize: 15.5,
          lineHeight: multiline ? 21 : undefined,
          color: color.ink,
          backgroundColor: color.cardSolid,
          borderRadius: radius.field,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: color.cardEdge,
          boxShadow: shadow.xs,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {hint ? <Text style={type.quiet}>{hint}</Text> : null}
    </View>
  );
}
