import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { avatarColors, color, radius, shadow, type } from "../theme/tokens";
import { Press } from "./Press";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.label, style]}>{children}</Text>;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, hue, size = 40 }: { name: string; hue: number; size?: number }) {
  const [a, b] = avatarColors(hue);
  return (
    <LinearGradient
      colors={[a, b]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px rgba(27,26,34,0.06)" }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: "600", color: "rgba(27,26,34,0.72)", letterSpacing: -0.2 }}>{initials(name)}</Text>
    </LinearGradient>
  );
}

type ButtonVariant = "ink" | "raised" | "quiet" | "light";

export function Button({
  label,
  onPress,
  onLongPress,
  variant = "ink",
  size = "md",
  style,
  disabled,
  leading,
  testID,
}: {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  leading?: ReactNode;
  testID?: string;
}) {
  const h = size === "sm" ? 34 : size === "md" ? 40 : 52;
  const px = size === "sm" ? 14 : size === "md" ? 18 : 24;
  const fs = size === "lg" ? 16.5 : 15;
  const v = variants[variant];
  return (
    <Press
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      haptic
      style={[{ height: h, paddingHorizontal: px, borderRadius: radius.capsule, borderCurve: "continuous", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: disabled ? 0.45 : 1 }, v.box, style]}
    >
      {leading}
      <Text style={[{ fontSize: fs, fontWeight: "600", letterSpacing: -0.1 }, v.text]}>{label}</Text>
    </Press>
  );
}

const variants: Record<ButtonVariant, { box: ViewStyle; text: TextStyle }> = {
  ink: { box: { backgroundColor: color.ink, boxShadow: shadow.lg }, text: { color: color.white } },
  raised: { box: { backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs }, text: { color: color.ink } },
  quiet: { box: { backgroundColor: "rgba(27,26,34,0.05)" }, text: { color: color.ink } },
  light: { box: { backgroundColor: color.white, boxShadow: shadow.xl }, text: { color: color.ink } },
};

export function IconButton({ children, onPress, size = 40, style, label }: { children: ReactNode; onPress?: () => void; size?: number; style?: StyleProp<ViewStyle>; label: string }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={0.96}
      haptic
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs, alignItems: "center", justifyContent: "center" }, style]}
    >
      {children}
    </Press>
  );
}

export function Chip({ children, outlined, style }: { children: ReactNode; outlined?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.chip, borderCurve: "continuous" },
        outlined ? { borderWidth: 1, borderColor: color.edge } : { backgroundColor: "rgba(255,255,255,0.8)", boxShadow: shadow.xs },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PersonChip({ name, hue, onPress }: { name: string; hue: number; onPress?: () => void }) {
  return (
    <Press onPress={onPress} scale={0.96} accessibilityRole="link" accessibilityLabel={name}>
      <Chip style={{ transform: [{ translateY: 4 }] }}>
        <Avatar name={name} hue={hue} size={18} />
        <Text style={{ fontSize: 15.5, fontWeight: "600", color: color.ink }}>{name}</Text>
      </Chip>
    </Press>
  );
}

export function SearchField({ placeholder, value, onChangeText }: { placeholder: string; value?: string; onChangeText?: (t: string) => void }) {
  return (
    <View style={styles.search}>
      <Text style={{ color: color.inkQuiet, fontSize: 15 }}>⌕</Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={color.inkQuiet}
        value={value}
        onChangeText={onChangeText}
        style={{ flex: 1, fontSize: 16, color: color.ink }}
      />
    </View>
  );
}

export function Hairline({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.edge, marginLeft: inset }} />;
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: color.cardEdge,
    boxShadow: shadow.card,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.field,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: color.cardEdge,
    boxShadow: "inset 0 1px 2px 0 rgba(27,26,34,0.05)",
  },
});
