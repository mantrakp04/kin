import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { userByKey } from "./lib";

export const registerToken = mutation({
  args: { userKey: v.optional(v.string()), token: v.string(), platform: v.string() },
  handler: async (ctx, { userKey, token, platform }) => {
    const user = await userByKey(ctx, userKey);
    const existing = await ctx.db.query("pushTokens").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (existing) await ctx.db.patch(existing._id, { userId: user._id, platform, at: Date.now() });
    else await ctx.db.insert("pushTokens", { userId: user._id, token, platform, at: Date.now() });
  },
});

export const remove = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    for (const row of await ctx.db.query("pushTokens").withIndex("by_token", (q) => q.eq("token", token)).collect()) await ctx.db.delete(row._id);
  },
});
