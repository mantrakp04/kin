import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { userByKey } from "./lib";

export const me = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const linked = people.filter((p) => p.handles.linkedin || p.handles.x || p.handles.instagram || p.handles.strava).length;
    return { ...user, contactCount: 412, linkedCount: 268, seededPeople: people.length, seededLinked: linked };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("users").collect()).map((u) => ({ key: u.key, name: u.name, hue: u.hue })),
});

export const setVisibility = mutation({
  args: {
    userKey: v.optional(v.string()),
    visibility: v.object({ city: v.boolean(), birthday: v.boolean(), jobChanges: v.boolean(), trips: v.boolean() }),
  },
  handler: async (ctx, { userKey, visibility }) => {
    const user = await userByKey(ctx, userKey);
    await ctx.db.patch(user._id, { visibility });
  },
});
