import { useQuery } from "convex/react";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { Backdrop } from "../../components/Backdrop";
import { useDockHeight } from "../../components/Dock";
import { CityList } from "../../components/map/CityList";
import { CityMap } from "../../components/map/CityMap";
import { CitySheet } from "../../components/map/CitySheet";
import { Segmented } from "../../components/map/Segmented";
import type { MapMode } from "../../components/map/types";
import { useSession } from "../../lib/session";
import { backdrops, space, type } from "../../theme/tokens";

const MODES: Array<{ value: MapMode; label: string; testID: string }> = [
  { value: "nearby", label: "Nearby", testID: "map-nearby" },
  { value: "cities", label: "Cities", testID: "map-cities" },
  { value: "world", label: "World", testID: "map-world" },
];

export default function MapTab() {
  const { userKey } = useSession();
  const [now] = useState(() => Date.now());
  const data = useQuery(api.cities.counts, { userKey, now });
  const insets = useSafeAreaInsets();
  const dockH = useDockHeight();
  const [mode, setMode] = useState<MapMode>("nearby");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data?.cities.find((c) => c._id === selectedId) ?? null;
  const headerH = insets.top + 12 + 44 + 34;

  return (
    <View style={{ flex: 1 }}>
      <Backdrop colors={backdrops.app} />
      {data && mode !== "cities" && <CityMap data={data} mode={mode} selectedId={selectedId} onSelect={setSelectedId} onClear={() => setSelectedId(null)} />}
      {data && mode === "cities" && (
        <ScrollView contentContainerStyle={{ paddingTop: headerH + space.sm, paddingHorizontal: space.page, paddingBottom: dockH + 12 }} showsVerticalScrollIndicator={false}>
          <CityList cities={data.cities} selectedId={selectedId} onSelect={setSelectedId} />
        </ScrollView>
      )}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        {mode !== "cities" && (
          <LinearGradient pointerEvents="none" colors={["rgba(239,238,252,0.96)", "rgba(239,238,252,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: headerH + 30 }} />
        )}
        <View pointerEvents="box-none" style={{ paddingTop: insets.top + 12, paddingHorizontal: space.page }}>
          <Segmented options={MODES} value={mode} onChange={(m) => setMode(m)} />
          <Text style={[type.quiet, { textAlign: "center", marginTop: 10 }]}>City-level, from each person's latest public update</Text>
        </View>
      </View>
      <CitySheet city={selected} bottom={dockH - 8} onClose={() => setSelectedId(null)} />
    </View>
  );
}
