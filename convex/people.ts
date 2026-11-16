import { query } from "./_generated/server";
import { v } from "convex/values";
import { currentCityId, nextBirthday, userByKey } from "./lib";

export const list = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    people.sort((a, b) => a.name.localeCompare(b.name));
    const groups: Array<{ letter: string; people: Array<{ _id: string; name: string; hue: number; city: string }> }> = [];
    for (const p of people) {
      const letter = p.name[0].toUpperCase();
      let g = groups[groups.length - 1];
      if (!g || g.letter !== letter) groups.push((g = { letter, people: [] }));
      g.people.push({ _id: p._id, name: p.name, hue: p.hue, city: p.city });
    }
    return groups;
  },
});

export const get = query({
  args: { personId: v.id("people"), now: v.optional(v.number()) },
  handler: async (ctx, { personId, now: clientNow }) => {
    const p = await ctx.db.get(personId);
    if (!p) return null;
    const now = clientNow ?? Date.now();
    const updates = await ctx.db
      .query("updates")
      .withIndex("by_person_at", (q) => q.eq("personId", p._id))
      .order("desc")
      .take(12);
    const { cityId } = await currentCityId(ctx, p, now);
    const current = cityId ? await ctx.db.get(cityId) : null;
    const gifts = await ctx.db.query("gifts").withIndex("by_person", (q) => q.eq("personId", p._id)).collect();
    const sent = [];
    for (const g of gifts.filter((g) => g.status === "paid" || g.status === "ordered")) {
      const product = await ctx.db.get(g.productId);
      if (product) sent.push({ _id: g._id, name: product.name, occasion: g.occasion, at: g.at });
    }
    return {
      ...p,
      currentCity: current?.name ?? p.city,
      birthdayIn: nextBirthday(p.birthday, now)?.days ?? null,
      updates: updates.filter((u) => u.at <= now || u.kind === "event"),
      sentGifts: sent,
    };
  },
});
