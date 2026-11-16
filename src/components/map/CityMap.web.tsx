import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Press } from "../Press";
import { CityPin } from "./CityPin";
import { pinSize, regionFor, type CityCounts, type MapMode } from "./types";

export function CityMap({ data, mode, selectedId, onSelect, onClear }: { data: CityCounts; mode: MapMode; selectedId: string | null; onSelect: (id: string) => void; onClear: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const r = regionFor(mode, data);
  const max = Math.max(1, ...data.cities.map((c) => c.count));
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#E6E4F5" }]} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClear} />
      {size.width > 0 &&
        data.cities.map((c) => {
          const s = pinSize(c.count, max);
          const x = ((c.lon - r.longitude) / r.longitudeDelta + 0.5) * size.width;
          const y = (0.5 - (c.lat - r.latitude) / r.latitudeDelta) * size.height;
          return (
            <Press
              key={c._id}
              testID={`city-marker-${c.name}`}
              accessibilityLabel={`${c.name}, ${c.count === 1 ? "1 person" : `${c.count} people`}`}
              onPress={() => onSelect(c._id)}
              style={{ position: "absolute", left: x - s / 2, top: y - s / 2 }}
            >
              <CityPin name={c.name} count={c.count} size={s} selected={c._id === selectedId} />
            </Press>
          );
        })}
    </View>
  );
}
