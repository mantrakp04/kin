import { z } from "zod";
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { claude, isoDay } from "./assistant";
import { CARD_TEMPLATES, ruleCard, type CardSpec } from "./cardRules";
import { cardSpec } from "./schema";
import { userByKey } from "./lib";
import { CARD_PROMPT } from "./prompts";

const CardOutput = z.object({
  template: z.enum(CARD_TEMPLATES),
  kicker: z.string(),
  headline: z.string(),
  detail: z.string(),
  stat: z.object({ value: z.string(), unit: z.string() }).nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  hue: z.number(),
  size: z.enum(["wide", "half"]),
});

export const input = internalQuery({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    const u = await ctx.db.get(updateId);
    if (!u) return null;
    const person = await ctx.db.get(u.personId);
    const city = u.cityId ? await ctx.db.get(u.cityId) : null;
    return { update: u, city: city?.name ?? null, person: person ? { firstName: person.name.split(" ")[0], city: person.city, hue: person.hue } : null };
  },
});

export const save = internalMutation({
  args: { updateId: v.id("updates"), card: cardSpec },
  handler: async (ctx, { updateId, card }) => {
    if (await ctx.db.get(updateId)) await ctx.db.patch(updateId, { card });
  },
});

export const pending = internalQuery({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const updates = await ctx.db.query("updates").withIndex("by_owner_at", (q) => q.eq("ownerId", user._id)).order("desc").collect();
    return updates.filter((u) => u.card?.by !== "ai").map((u) => u._id);
  },
});

const words = (s: string, n: number) => s.trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ");

async function generateCard(ctx: ActionCtx, updateId: Id<"updates">): Promise<CardSpec["by"] | null> {
  const data = await ctx.runQuery(internal.cards.input, { updateId });
  if (!data?.person) return null;
  const { update: u, person, city } = data;
  const rules = ruleCard({ kind: u.kind, text: u.text, at: u.at, until: u.until, eventAt: u.eventAt, place: u.place, city, personHue: person.hue });
  const dateRange = u.kind === "event" && u.eventAt ? { start: u.eventAt } : u.until ? { start: u.at, end: u.until } : undefined;

  let card: CardSpec = { ...rules, by: "rules" };
  try {
    const out = await claude(
      CARD_PROMPT,
      {
        today: isoDay(Date.now()),
        update: { kind: u.kind, text: u.text, source: u.source, date: isoDay(u.at), until: u.until ? isoDay(u.until) : null, eventAt: u.eventAt ? new Date(u.eventAt).toISOString() : null, place: u.place ?? null, city },
        person,
      },
      CardOutput,
      "cards.generate",
    );
    if (out && out.headline.trim()) {
      card = {
        template: out.template,
        kicker: words(out.kicker, 3),
        headline: words(out.headline, 6),
        detail: words(out.detail, 10),
        stat: out.stat ?? undefined,
        from: out.from ?? undefined,
        to: out.to ?? undefined,
        dateRange: out.template === "trip" || out.template === "event" ? dateRange : undefined,
        hue: ((Math.round(out.hue) % 360) + 360) % 360,
        size: out.size,
        by: "ai",
      };
    }
  } catch (e) {
    console.log("cards.generate: falling back to rules", e instanceof Error ? e.message : e);
  }
  await ctx.runMutation(internal.cards.save, { updateId, card });
  return card.by;
}

export const generate = internalAction({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    await generateCard(ctx, updateId);
  },
});

export const backfill = action({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<{ total: number; ai: number; rules: number }> => {
    const ids = await ctx.runQuery(internal.cards.pending, { userKey });
    const result = { total: ids.length, ai: 0, rules: 0 };
    for (let i = 0; i < ids.length; i += 6) {
      for (const by of await Promise.all(ids.slice(i, i + 6).map((id) => generateCard(ctx, id)))) {
        if (by) result[by] += 1;
      }
    }
    return result;
  },
});
