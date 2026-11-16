import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DAY } from "./lib";
import { alexPeople, alexUpdates, cities, mayaGift, mayaPeople, mayaUpdates, products, users, type SeedPerson, type SeedUpdate } from "./seedData";

const HOUR = 60 * 60 * 1000;
const TABLES = ["rsvps", "gifts", "shares", "updates", "people", "products", "users", "cities"] as const;

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const table of TABLES) {
      for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
    }

    const cityIds = new Map<string, Id<"cities">>();
    for (const c of cities) cityIds.set(c.name, await ctx.db.insert("cities", c));

    const userIds = new Map<string, Id<"users">>();
    for (const u of users) userIds.set(u.key, await ctx.db.insert("users", { ...u, cityId: cityIds.get(u.city) }));

    const productIds = new Map<string, Id<"products">>();
    for (const p of products) productIds.set(p.key, await ctx.db.insert("products", p));

    const load = async (ownerKey: string, people: SeedPerson[], updates: SeedUpdate[]) => {
      const ownerId = userIds.get(ownerKey)!;
      const personIds = new Map<string, Id<"people">>();
      for (const { lastContactDays, linkedUser, ...p } of people) {
        personIds.set(
          p.key,
          await ctx.db.insert("people", {
            ...p,
            ownerId,
            cityId: cityIds.get(p.city),
            lastContactAt: now - lastContactDays * DAY,
            linkedUserId: linkedUser ? userIds.get(linkedUser) : undefined,
          }),
        );
      }
      for (const { person, hoursAgo, city, ...u } of updates) {
        const personId = personIds.get(person);
        if (!personId) throw new Error("Seed update for unknown person " + person);
        await ctx.db.insert("updates", { ...u, personId, ownerId, cityId: city ? cityIds.get(city) : undefined, at: now - hoursAgo * HOUR });
      }
      return { ownerId, personIds };
    };

    const alex = await load("alex", alexPeople, alexUpdates);
    await load("maya", mayaPeople, mayaUpdates);
    await ctx.scheduler.runAfter(0, api.cards.backfill, { userKey: "alex" });
    await ctx.scheduler.runAfter(0, api.cards.backfill, { userKey: "maya" });

    const product = products.find((p) => p.key === mayaGift.product)!;
    await ctx.db.insert("gifts", {
      ownerId: alex.ownerId,
      personId: alex.personIds.get(mayaGift.person)!,
      occasion: mayaGift.occasion,
      productId: productIds.get(mayaGift.product)!,
      reason: mayaGift.reason,
      alternatives: mayaGift.alternatives.map((a) => ({ productId: productIds.get(a.product)!, reason: a.reason })),
      arriveBy: now + product.deliveryDays * DAY,
      status: "suggested",
      at: now,
    });

    return {
      cities: cities.length,
      users: users.length,
      people: alexPeople.length + mayaPeople.length,
      updates: alexUpdates.length + mayaUpdates.length,
      products: products.length,
      gifts: 1,
    };
  },
});
