import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { userByKey } from "./lib";

export const set = mutation({
  args: { userKey: v.optional(v.string()), updateId: v.id("updates"), going: v.boolean() },
  handler: async (ctx, { userKey, updateId, going }) => {
    const user = await userByKey(ctx, userKey);
    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_owner_update", (q) => q.eq("ownerId", user._id).eq("updateId", updateId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { going });
    else await ctx.db.insert("rsvps", { ownerId: user._id, updateId, going });
  },
});
