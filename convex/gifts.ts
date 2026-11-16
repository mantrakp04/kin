import { z } from "zod";
import { action, internalAction, internalMutation, internalQuery, mutation, type ActionCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { DAY, nextBirthday, userByKey } from "./lib";
import { claude, isoDay } from "./assistant";
import { GIFT_PROMPT } from "./prompts";

const GiftPick = z.object({
  match: z.enum(["strong", "weak", "none"]),
  productId: z.string(),
  signalId: z.string(),
  reason: z.string(),
  alternatives: z.array(z.object({ productId: z.string(), reason: z.string() })),
});

const startOfDay = (at: number) => Math.floor(at / DAY) * DAY;
export const arrivalDay = (now: number, deliveryDays: number) => startOfDay(now) + deliveryDays * DAY;

function arriveByFor(person: Doc<"people">, occasion: string, now: number) {
  const birthday = occasion.toLowerCase().includes("birthday") ? nextBirthday(person.birthday, now) : null;
  return birthday?.at ?? startOfDay(now) + 14 * DAY;
}

async function sentProductIds(ctx: QueryCtx, personId: Id<"people">, except?: Id<"gifts">) {
  const gifts = await ctx.db.query("gifts").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
  return gifts.filter((g) => g._id !== except && (g.status === "paid" || g.status === "ordered"));
}

function productProblem(product: Doc<"products">, rules: { budget: number; arriveBy: number; now: number; sent: Set<string> }) {
  if (product.price > rules.budget) return `over budget ($${product.price} > $${rules.budget})`;
  if (arrivalDay(rules.now, product.deliveryDays) > rules.arriveBy) return "too late to arrive in time";
  if (rules.sent.has(product._id)) return "already sent this before";
  return null;
}

export const pickerInput = internalQuery({
  args: { personId: v.id("people"), occasion: v.string(), now: v.number() },
  handler: async (ctx, { personId, occasion, now }) => {
    const person = await ctx.db.get(personId);
    if (!person) return null;
    const owner = await ctx.db.get(person.ownerId);
    if (!owner) return null;
    const updates = await ctx.db
      .query("updates")
      .withIndex("by_person_at", (q) => q.eq("personId", personId).gte("at", now - 90 * DAY))
      .order("desc")
      .collect();
    const sent = await sentProductIds(ctx, personId);
    const history = [];
    for (const g of sent) {
      const product = await ctx.db.get(g.productId);
      if (product) history.push({ productId: product._id, name: product.name, occasion: g.occasion, date: isoDay(g.at) });
    }
    const products = await ctx.db.query("products").collect();
    const arriveBy = arriveByFor(person, occasion, now);
    const budget = owner.budget ?? 60;
    return {
      ownerId: owner._id,
      arriveBy,
      budget,
      input: {
        today: isoDay(now),
        recipient: {
          firstName: person.name.split(" ")[0],
          pronoun: person.pronoun ?? null,
          city: person.city,
          role: person.role,
          interests: person.interests,
          howTheyKnowEachOther: person.close ? "close friend" : null,
        },
        signals: updates.filter((u) => u.at <= now).map((u) => ({ id: u._id as string, text: u.text, source: u.source, date: isoDay(u.at) })),
        history,
        occasion,
        arriveBy: isoDay(arriveBy),
        budget,
        catalog: products.map((p) => ({ id: p._id as string, name: p.name, price: p.price, deliveryDays: p.deliveryDays, tags: p.tags })),
      },
    };
  },
});

export const save = internalMutation({
  args: {
    ownerId: v.id("users"),
    personId: v.id("people"),
    occasion: v.string(),
    productId: v.id("products"),
    reason: v.string(),
    alternatives: v.array(v.object({ productId: v.id("products"), reason: v.string() })),
    arriveBy: v.number(),
  },
  handler: async (ctx, args) => ctx.db.insert("gifts", { ...args, status: "suggested", at: Date.now() }),
});

export const validate = internalQuery({
  args: { personId: v.id("people"), productIds: v.array(v.string()), budget: v.number(), arriveBy: v.number(), now: v.number() },
  handler: async (ctx, { personId, productIds, budget, arriveBy, now }) => {
    const sent = new Set<string>((await sentProductIds(ctx, personId)).map((g) => g.productId));
    return Promise.all(
      productIds.map(async (raw) => {
        const id = ctx.db.normalizeId("products", raw);
        const product = id ? await ctx.db.get(id) : null;
        if (!product) return { id: null, problem: "not in catalog" };
        return { id: product._id, problem: productProblem(product, { budget, arriveBy, now, sent }) };
      }),
    );
  },
});

export async function suggestGift(ctx: ActionCtx, personId: Id<"people">, occasion: string): Promise<Id<"gifts"> | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY not set: gifts.suggest skipped (seeded suggestions still show)");
    return null;
  }
  const now = Date.now();
  const picker = await ctx.runQuery(internal.gifts.pickerInput, { personId, occasion, now });
  if (!picker) return null;
  const memory = await ctx.runAction(internal.memory.recall, { personId, query: `gift ideas for ${occasion}` });
  const memorySignals = [...memory.profile, ...memory.memories].map((text, i) => ({ id: `memory_${i}`, text, source: "Kin memory", date: picker.input.today }));
  const input = { ...picker.input, signals: [...picker.input.signals, ...memorySignals] };

  const pick = await claude(GIFT_PROMPT, input, GiftPick, "gifts.suggest");
  if (!pick || pick.match !== "strong") {
    console.log(`gifts.suggest: nothing saved (match ${pick?.match ?? "null"})`);
    return null;
  }
  const ids = [pick.productId, ...pick.alternatives.map((a) => a.productId)];
  const checks = await ctx.runQuery(internal.gifts.validate, { personId, productIds: ids, budget: picker.budget, arriveBy: picker.arriveBy, now });
  const main = checks[0];
  if (!main.id || main.problem) {
    console.log(`gifts.suggest: rejected pick ${pick.productId}: ${main.problem}`);
    return null;
  }
  const seen = new Set<string>([main.id]);
  const alternatives: Array<{ productId: Id<"products">; reason: string }> = [];
  pick.alternatives.forEach((alt, i) => {
    const check = checks[i + 1];
    if (!check.id || check.problem || seen.has(check.id) || alternatives.length >= 3) return;
    seen.add(check.id);
    alternatives.push({ productId: check.id, reason: alt.reason });
  });
  return await ctx.runMutation(internal.gifts.save, {
    ownerId: picker.ownerId,
    personId,
    occasion,
    productId: main.id,
    reason: pick.reason,
    alternatives,
    arriveBy: picker.arriveBy,
  });
}

export const suggest = internalAction({
  args: { personId: v.id("people"), occasion: v.string() },
  handler: async (ctx, { personId, occasion }): Promise<Id<"gifts"> | null> => suggestGift(ctx, personId, occasion),
});

export const owns = internalQuery({
  args: { userKey: v.optional(v.string()), personId: v.id("people") },
  handler: async (ctx, { userKey, personId }) => {
    const user = await userByKey(ctx, userKey);
    const person = await ctx.db.get(personId);
    return !!person && person.ownerId === user._id;
  },
});

export const suggestForPerson = action({
  args: { userKey: v.optional(v.string()), personId: v.id("people"), occasion: v.optional(v.string()) },
  handler: async (ctx, { userKey, personId, occasion }): Promise<Id<"gifts"> | null> => {
    if (!(await ctx.runQuery(internal.gifts.owns, { userKey, personId }))) return null;
    return suggestGift(ctx, personId, occasion ?? "birthday");
  },
});

export const dismiss = mutation({
  args: { userKey: v.optional(v.string()), giftId: v.id("gifts") },
  handler: async (ctx, { userKey, giftId }) => {
    const user = await userByKey(ctx, userKey);
    const gift = await ctx.db.get(giftId);
    if (!gift || gift.ownerId !== user._id || gift.status !== "suggested") return false;
    await ctx.db.patch(giftId, { status: "dismissed" });
    return true;
  },
});

const via = v.union(v.literal("app"), v.literal("imessage"));

export const markPaid = internalMutation({
  args: { giftId: v.id("gifts"), via: v.optional(via), paymentId: v.optional(v.string()) },
  handler: async (ctx, { giftId, via, paymentId }) => {
    const gift = await ctx.db.get(giftId);
    if (!gift || gift.status !== "suggested") return false;
    await ctx.db.patch(giftId, { status: "paid", via: via ?? gift.via ?? "app", ...(paymentId ? { paymentId } : {}) });
    return true;
  },
});

export const markOrdered = internalMutation({
  args: { giftId: v.id("gifts"), via: v.optional(via) },
  handler: async (ctx, { giftId, via }) => {
    const gift = await ctx.db.get(giftId);
    if (!gift || gift.status !== "paid") return false;
    await ctx.db.patch(giftId, { status: "ordered", ...(via ? { via } : {}) });
    await ctx.scheduler.runAfter(0, internal.memory.rememberGift, { giftId });
    return true;
  },
});

export const swapProduct = internalMutation({
  args: { giftId: v.id("gifts"), productId: v.id("products") },
  handler: async (ctx, { giftId, productId }) => {
    const gift = await ctx.db.get(giftId);
    if (!gift || gift.status !== "suggested" || gift.productId === productId) return false;
    if (!(await ctx.db.get(productId))) return false;
    const chosen = gift.alternatives.find((a) => a.productId === productId);
    await ctx.db.patch(giftId, {
      productId,
      reason: chosen?.reason ?? gift.reason,
      alternatives: [{ productId: gift.productId, reason: gift.reason }, ...gift.alternatives.filter((a) => a.productId !== productId)],
    });
    return true;
  },
});

export const get = internalQuery({
  args: { giftId: v.id("gifts"), now: v.optional(v.number()) },
  handler: async (ctx, { giftId, now: clientNow }) => {
    const gift = await ctx.db.get(giftId);
    if (!gift) return null;
    const now = clientNow ?? Date.now();
    const [person, product, owner] = await Promise.all([ctx.db.get(gift.personId), ctx.db.get(gift.productId), ctx.db.get(gift.ownerId)]);
    if (!person || !product || !owner) return null;
    const alternatives = [];
    for (const alt of gift.alternatives) {
      const p = await ctx.db.get(alt.productId);
      if (p) alternatives.push({ productId: p._id, name: p.name, price: p.price, arrives: isoDay(Math.min(gift.arriveBy, arrivalDay(now, p.deliveryDays))), reason: alt.reason });
    }
    const prior = await sentProductIds(ctx, gift.personId, gift._id);
    const sent = new Set<string>(prior.map((g) => g.productId));
    const alreadySentForOccasion = prior.some((g) => g.occasion === gift.occasion && g.at > now - 300 * DAY);
    let problem: string | null = null;
    if (gift.status === "paid" || gift.status === "ordered") problem = "already sent";
    else if (gift.status === "dismissed") problem = "this suggestion was dismissed";
    else if (alreadySentForOccasion) problem = `already sent ${person.name.split(" ")[0]} a gift for this ${gift.occasion}`;
    else problem = productProblem(product, { budget: owner.budget ?? 60, arriveBy: gift.arriveBy, now, sent });
    return {
      _id: gift._id,
      ownerId: owner._id,
      ownerKey: owner.key,
      status: gift.status,
      via: gift.via ?? null,
      occasion: gift.occasion,
      reason: gift.reason,
      person: { _id: person._id, name: person.name, firstName: person.name.split(" ")[0] },
      product: { _id: product._id, name: product.name, price: product.price, deliveryDays: product.deliveryDays },
      arrives: Math.min(gift.arriveBy, arrivalDay(now, product.deliveryDays)),
      arriveBy: gift.arriveBy,
      checkoutId: gift.checkoutId ?? null,
      alternatives,
      problem,
    };
  },
});
