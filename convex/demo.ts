import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { updateKind } from "./schema";
import { DAY, nextBirthday, userByKey } from "./lib";

export const resetMayaGift = mutation({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const maya = await ctx.db
      .query("people")
      .withIndex("by_owner_key", (q) => q.eq("ownerId", user._id).eq("key", "maya"))
      .unique();
    if (!maya) throw new Error("No Maya. Run seed:run first.");
    const gift = (await ctx.db.query("gifts").withIndex("by_person", (q) => q.eq("personId", maya._id)).collect()).sort((a, z) => z.at - a.at)[0];
    if (!gift) throw new Error("No gift for Maya. Run seed:run first.");
    const product = await ctx.db.get(gift.productId);
    const now = Date.now();
    await ctx.db.patch(gift._id, {
      status: "suggested",
      via: undefined,
      paymentId: undefined,
      checkoutId: undefined,
      arriveBy: now + 30 * DAY,
      at: now,
    });
    for (const o of await ctx.db.query("giftOrders").withIndex("by_gift", (q) => q.eq("giftId", gift._id)).collect()) await ctx.db.delete(o._id);
    return gift._id;
  },
});

export const resetChat = mutation({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const thread = await ctx.db.query("agentThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).first();
    if (!thread) return 0;
    const messages = await ctx.db.query("agentMessages").withIndex("by_thread_at", (q) => q.eq("threadId", thread._id)).collect();
    for (const m of messages) await ctx.db.delete(m._id);
    return messages.length;
  },
});

export const addUpdate = mutation({
  args: {
    userKey: v.optional(v.string()),
    name: v.string(),
    text: v.string(),
    kind: v.optional(updateKind),
    source: v.optional(v.string()),
    city: v.optional(v.string()),
    until: v.optional(v.number()),
    eventAt: v.optional(v.number()),
    place: v.optional(v.string()),
  },
  handler: async (ctx, { userKey, name, city, kind, source, ...rest }) => {
    const user = await userByKey(ctx, userKey);
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const needle = name.trim().toLowerCase();
    const person =
      people.find((p) => p.name.toLowerCase() === needle || p.key === needle) ??
      people.find((p) => p.name.toLowerCase().startsWith(needle));
    if (!person) throw new Error("No person named " + name);
    const cityDoc = city ? await ctx.db.query("cities").withIndex("by_name", (q) => q.eq("name", city)).unique() : null;
    if (city && !cityDoc) throw new Error("Unknown city " + city);
    const updateId = await ctx.db.insert("updates", {
      ...rest,
      personId: person._id,
      ownerId: user._id,
      kind: kind ?? "post",
      source: source ?? "Kin",
      cityId: cityDoc?._id,
      at: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.cards.generate, { updateId });
    return updateId;
  },
});

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const r = n % 100;
  return n + (s[(r - 20) % 10] ?? s[r] ?? s[0]);
}

export const birthdayCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const scheduled: string[] = [];
    for (const user of await ctx.db.query("users").collect()) {
      const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
      for (const p of people) {
        const b = nextBirthday(p.birthday, now);
        if (!b || b.days > 3) continue;
        const gifts = await ctx.db.query("gifts").withIndex("by_person", (q) => q.eq("personId", p._id)).collect();
        if (gifts.some((g) => g.status !== "dismissed" && g.at > now - 30 * DAY)) continue;
        const year = p.birthday?.split("-")[2];
        const occasion = year ? ordinal(new Date(b.at).getUTCFullYear() - Number(year)) + " birthday" : "Birthday";
        await ctx.scheduler.runAfter(0, internal.gifts.suggest, { personId: p._id, occasion });
        scheduled.push(user.key + ":" + p.name);
      }
    }
    console.log("birthdayCheck scheduled gifts:suggest for", scheduled.length ? scheduled.join(", ") : "nobody");
    return scheduled;
  },
});
