import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { PanResponder, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Avatar } from "../ui";
import { Press } from "../Press";
import { springs } from "../../theme/motion";
import { color, radius, shadow, space, type } from "../../theme/tokens";
import type { City } from "./types";

const ROW_H = 54;

export function CitySheet({ city, bottom, onClose }: { city: City | null; bottom: number; onClose: () => void }) {
  const { height: screenH } = useWindowDimensions();
  const still = useReducedMotion();
  const [shown, setShown] = useState<City | null>(city);
  const hidden = screenH;
  const y = useSharedValue(hidden);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (city) setShown(city);
    const to = city ? 0 : hidden;
    y.value = still ? withTiming(to, { duration: 150 }) : withSpring(to, springs.smooth);
  }, [city?._id, hidden]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        y.value = g.dy > 0 ? g.dy : g.dy * 0.15;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.9) closeRef.current();
        else y.value = withSpring(0, springs.snappy);
      },
      onPanResponderTerminate: () => {
        y.value = withSpring(0, springs.snappy);
      },
    }),
  ).current;

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const c = shown;

  return (
    <Animated.View testID="city-sheet" pointerEvents={city ? "auto" : "none"} style={[styles.wrap, { bottom }, style]}>
      <View style={styles.sheet}>
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color.card }]} />
        <View {...pan.panHandlers} style={{ paddingTop: 8, paddingHorizontal: space.xl, paddingBottom: space.sm }}>
          <View style={styles.grab} />
          {c && (
            <>
              <Text style={[type.name, { fontSize: 32, marginTop: space.md }]} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={[type.quiet, { fontSize: 14, marginTop: 2 }]}>
                {c.count} {c.count === 1 ? "person" : "people"} · {c.country}
              </Text>
            </>
          )}
        </View>
        {c && (
          <ScrollView style={{ maxHeight: ROW_H * 4.5 }} contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.lg }} showsVerticalScrollIndicator={false}>
            {c.people.map((p, i) => (
              <Press
                key={p._id}
                testID={`city-person-${p.name}`}
                accessibilityRole="button"
                accessibilityLabel={p.name}
                scale={0.985}
                onPress={() => router.push(`/person/${p._id}?from=Map`)}
                style={styles.row}
              >
                <Avatar name={p.name} hue={p.hue} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={type.rowName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[type.quiet, { marginTop: 1 }]} numberOfLines={1}>
                    {p.reason}
                  </Text>
                </View>
                {i < c.people.length - 1 && <View style={styles.hairline} />}
              </Press>
            ))}
          </ScrollView>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 8, right: 8, borderRadius: radius.sheet, borderCurve: "continuous", boxShadow: shadow.dock },
  sheet: { borderRadius: radius.sheet, borderCurve: "continuous", overflow: "hidden", borderWidth: 1, borderColor: color.cardEdge },
  grab: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: color.edge },
  row: { height: ROW_H, flexDirection: "row", alignItems: "center", gap: space.md },
  hairline: { position: "absolute", left: 34 + space.md, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: color.edge },
});
