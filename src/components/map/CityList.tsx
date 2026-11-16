import { Text, View, StyleSheet } from "react-native";
import { Enter } from "../Enter";
import { Press } from "../Press";
import { color, space, type } from "../../theme/tokens";
import type { City } from "./types";

export function CityList({ cities, selectedId, onSelect }: { cities: City[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <View>
      {cities.map((c, i) => {
        const on = c._id === selectedId;
        return (
          <Enter key={c._id} index={i}>
            <Press testID={`city-row-${c.name}`} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.count === 1 ? "1 person" : `${c.count} people`}`} onPress={() => onSelect(c._id)} scale={0.985} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[type.rowName, on && { color: color.accent }]}>{c.name}</Text>
                <Text style={[type.quiet, { marginTop: 2 }]}>{c.country}</Text>
              </View>
              <Text style={[styles.count, on && { color: color.accent }]}>{c.count}</Text>
              {i < cities.length - 1 && <View style={styles.hairline} />}
            </Press>
          </Enter>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, minHeight: 68 },
  count: { fontSize: 34, fontWeight: "200", color: color.ink, letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  hairline: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: color.edge },
});
