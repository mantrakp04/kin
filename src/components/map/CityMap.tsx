import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { CityPin } from "./CityPin";
import { pinSize, regionFor, type CityCounts, type MapMode } from "./types";

export function CityMap({ data, mode, selectedId, onSelect, onClear }: { data: CityCounts; mode: MapMode; selectedId: string | null; onSelect: (id: string) => void; onClear: () => void }) {
  const map = useRef<MapView>(null);
  const lastMarkerPress = useRef(0);
  const max = Math.max(1, ...data.cities.map((c) => c.count));
  useEffect(() => {
    map.current?.animateToRegion(regionFor(mode, data), 650);
  }, [mode]);
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={regionFor(mode, data)}
      mapType="mutedStandard"
      showsPointsOfInterests={false}
      showsBuildings={false}
      pitchEnabled={false}
      rotateEnabled={false}
      showsCompass={false}
      toolbarEnabled={false}
      onPress={(e) => {
        if (e.nativeEvent.action === "marker-press" || Date.now() - lastMarkerPress.current < 350) return;
        onClear();
      }}
    >
      {data.cities.map((c) => (
        <Marker
          key={c._id}
          testID={`city-marker-${c.name}`}
          identifier={c._id}
          coordinate={{ latitude: c.lat, longitude: c.lon }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges
          accessibilityLabel={`${c.name}, ${c.count === 1 ? "1 person" : `${c.count} people`}`}
          onPress={(e) => {
            e.stopPropagation?.();
            lastMarkerPress.current = Date.now();
            onSelect(c._id);
          }}
        >
          <CityPin name={c.name} count={c.count} size={pinSize(c.count, max)} selected={c._id === selectedId} />
        </Marker>
      ))}
    </MapView>
  );
}
