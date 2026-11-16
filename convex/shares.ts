import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { audience } from "./schema";
import { userByKey } from "./lib";
import { internal } from "./_generated/api";

const DISPLAY = { close: 14, everyone: 212, city: 31 } as const;

export const audiences = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    return [
      { key: "close" as const, label: "Close friends", count: DISPLAY.close },
      { key: "everyone" as const, label: "Everyone on Kin", count: DISPLAY.everyone, note: "of your contacts" },
      { key: "city" as const, label: `People in ${user.city}`, count: DISPLAY.city, note: "contacts" },
    ];
  },
});

export const create = mutation({
  args: { userKey: v.optional(v.string()), text: v.string(), audience, place: v.optional(v.string()) },
  handler: async (ctx, { userKey, text, audience, place }) => {
    const author = await userByKey(ctx, userKey);
    const at = Date.now();
    const city = await ctx.db.query("cities").withIndex("by_name", (q) => q.eq("name", author.city)).unique();
    await ctx.db.insert("shares", { authorId: author._id, text, audience, cityId: city?._id, reach: DISPLAY[audience], at });
    const rows = await ctx.db.query("people").withIndex("by_linked_user", (q) => q.eq("linkedUserId", author._id)).collect();
    for (const row of rows) {
      if (audience === "close" && !row.close) continue;
      if (audience === "city") {
        const owner = await ctx.db.get(row.ownerId);
        if (owner?.city !== author.city) continue;
      }
      const updateId = await ctx.db.insert("updates", { personId: row._id, ownerId: row.ownerId, kind: "post", text, source: "Kin", at, place });
      await ctx.scheduler.runAfter(0, internal.cards.generate, { updateId });
    }
    return { reach: DISPLAY[audience] };
  },
});
