import { Text, View, StyleSheet } from "react-native";
import { Avatar } from "../ui";
import { Press } from "../Press";
import { color, space, type } from "../../theme/tokens";

export const ROW_H = 56;
export const HEADER_H = 34;

export function PersonRow({ name, hue, city, last, onPress }: { name: string; hue: number; city: string; last: boolean; onPress: () => void }) {
  return (
    <Press testID={`person-row-${name}`} accessibilityRole="button" accessibilityLabel={name} onPress={onPress} scale={0.985} style={styles.row}>
      <Avatar name={name} hue={hue} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={type.rowName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.quiet, { marginTop: 1 }]} numberOfLines={1}>
          {city}
        </Text>
      </View>
      {!last && <View style={styles.hairline} />}
    </Press>
  );
}

export function LetterHeader({ letter }: { letter: string }) {
  return (
    <View style={{ height: HEADER_H, justifyContent: "flex-end", paddingBottom: 6 }}>
      <Text style={type.label}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: ROW_H, flexDirection: "row", alignItems: "center", gap: space.md },
  hairline: { position: "absolute", left: 36 + space.md, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: color.edge },
});
