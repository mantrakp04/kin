import { query } from "./_generated/server";
import { v } from "convex/values";
import { currentCityId, userByKey } from "./lib";

export const counts = query({
  args: { userKey: v.optional(v.string()), now: v.optional(v.number()) },
  handler: async (ctx, { userKey, now: clientNow }) => {
    const user = await userByKey(ctx, userKey);
    const now = clientNow ?? Date.now();
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const cities = await ctx.db.query("cities").collect();
    const byCity = new Map(cities.map((c) => [c._id, { city: c, people: [] as Array<{ _id: string; name: string; hue: number; reason: string; visiting: boolean }> }]));
    for (const p of people) {
      const { cityId, update } = await currentCityId(ctx, p, now);
      if (!cityId) continue;
      const slot = byCity.get(cityId);
      if (!slot) continue;
      const visiting = !!update && update.kind === "trip";
      const reason = visiting && update
        ? (update.until ? `Visiting until ${new Date(update.until).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "Visiting") + ` · ${update.source}`
        : update?.kind === "move"
          ? `Moved here · ${update.source}`
          : "Lives here";
      slot.people.push({ _id: p._id, name: p.name, hue: p.hue, reason, visiting });
    }
    const userCity = cities.find((c) => c.name === user.city) ?? null;
    return {
      userCity: userCity ? { _id: userCity._id, name: userCity.name, lat: userCity.lat, lon: userCity.lon } : null,
      cities: [...byCity.values()]
        .filter((s) => s.people.length > 0)
        .map((s) => ({
          _id: s.city._id,
          name: s.city.name,
          country: s.city.country,
          lat: s.city.lat,
          lon: s.city.lon,
          count: s.people.length,
          people: s.people.sort((a, b) => Number(b.visiting) - Number(a.visiting) || a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => b.count - a.count),
    };
  },
});
