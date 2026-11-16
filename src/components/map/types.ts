import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type CityCounts = NonNullable<FunctionReturnType<typeof api.cities.counts>>;
export type City = CityCounts["cities"][number];
export type MapMode = "nearby" | "cities" | "world";
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export function regionFor(mode: MapMode, data: CityCounts): Region {
  const { cities, userCity } = data;
  const home = userCity ?? cities[0];
  if (mode === "nearby" && home) {
    const latitudeDelta = 5.4;
    return { latitude: home.lat, longitude: home.lon, latitudeDelta, longitudeDelta: latitudeDelta / Math.max(0.3, Math.cos((home.lat * Math.PI) / 180)) };
  }
  if (!cities.length) return { latitude: 20, longitude: 0, latitudeDelta: 140, longitudeDelta: 360 };
  const lats = cities.map((c) => c.lat);
  const lons = cities.map((c) => c.lon);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.min(150, Math.max(30, (maxLat - minLat) * 1.6)),
    longitudeDelta: Math.min(360, Math.max(40, (maxLon - minLon) * 1.4)),
  };
}

export function pinSize(count: number, max: number) {
  return Math.round(26 + 28 * Math.sqrt(Math.min(1, (count - 1) / Math.max(1, max - 1))));
}
