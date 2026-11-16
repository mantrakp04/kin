import { query } from "./_generated/server";
import { v } from "convex/values";
import { DAY, nextBirthday, userByKey } from "./lib";

export const today = query({
  args: { userKey: v.optional(v.string()), now: v.optional(v.number()) },
  handler: async (ctx, { userKey, now: clientNow }) => {
    const user = await userByKey(ctx, userKey);
    const now = clientNow ?? Date.now();
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const byId = new Map(people.map((p) => [p._id, p]));
    const pick = (p: (typeof people)[number]) => ({ _id: p._id, name: p.name, hue: p.hue, pronoun: p.pronoun ?? null, city: p.city });

    const gifts = await ctx.db.query("gifts").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const live = gifts.filter((g) => g.status !== "dismissed" && g.arriveBy >= now - DAY);

    const comingUp: Array<
      | { type: "gift"; key: string; at: number; person: ReturnType<typeof pick>; days: number; age: number | null; gift: { _id: string; status: string; reason: string; via: string | null; product: { _id: string; name: string; price: number; deliveryDays: number }; arrives: number; alternatives: Array<{ product: { _id: string; name: string; price: number; deliveryDays: number }; reason: string }> } }
      | { type: "birthday"; key: string; at: number; person: ReturnType<typeof pick>; days: number; age: number | null }
      | { type: "event"; key: string; at: number; person: ReturnType<typeof pick>; update: { _id: string; text: string; source: string; place: string | null; eventAt: number }; going: boolean }
    > = [];

    for (const p of people) {
      const b = nextBirthday(p.birthday, now);
      if (!b || b.days > 7) continue;
      const age = p.birthday?.split("-")[2] ? new Date(b.at).getUTCFullYear() - Number(p.birthday.split("-")[2]) : null;
      const gift = live.filter((g) => g.personId === p._id).sort((a, z) => z.at - a.at)[0];
      if (gift) {
        const product = await ctx.db.get(gift.productId);
        if (product) {
          const alternatives = [];
          for (const alt of gift.alternatives) {
            const ap = await ctx.db.get(alt.productId);
            if (ap) alternatives.push({ product: { _id: ap._id, name: ap.name, price: ap.price, deliveryDays: ap.deliveryDays }, reason: alt.reason });
          }
          comingUp.push({
            type: "gift",
            key: gift._id,
            at: b.at,
            person: pick(p),
            days: b.days,
            age,
            gift: {
              _id: gift._id,
              status: gift.status,
              reason: gift.reason,
              via: gift.via ?? null,
              product: { _id: product._id, name: product.name, price: product.price, deliveryDays: product.deliveryDays },
              arrives: Math.min(gift.arriveBy, now + product.deliveryDays * DAY),
              alternatives,
            },
          });
          continue;
        }
      }
      comingUp.push({ type: "birthday", key: "b" + p._id, at: b.at, person: pick(p), days: b.days, age });
    }

    const recent = await ctx.db
      .query("updates")
      .withIndex("by_owner_at", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(200);

    for (const u of recent) {
      if (u.kind !== "event" || !u.eventAt || u.eventAt < now || u.eventAt > now + 7 * DAY) continue;
      const p = byId.get(u.personId);
      if (!p) continue;
      const rsvp = await ctx.db
        .query("rsvps")
        .withIndex("by_owner_update", (q) => q.eq("ownerId", user._id).eq("updateId", u._id))
        .unique();
      comingUp.push({ type: "event", key: u._id, at: u.eventAt, person: pick(p), update: { _id: u._id, text: u.text, source: u.source, place: u.place ?? null, eventAt: u.eventAt }, going: rsvp?.going ?? false });
    }
    comingUp.sort((a, z) => a.at - z.at);

    const updates = recent
      .filter((u) => u.kind !== "event" && u.at <= now)
      .slice(0, 20)
      .flatMap((u) => {
        const p = byId.get(u.personId);
        return p ? [{ _id: u._id, kind: u.kind, text: u.text, source: u.source, at: u.at, until: u.until ?? null, place: u.place ?? null, card: u.card ?? null, person: pick(p) }] : [];
      });

    return { comingUp, updates, generatedAt: now };
  },
});
