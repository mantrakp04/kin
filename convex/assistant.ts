import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { action, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { DAY, nextBirthday, userByKey } from "./lib";
import { MESSAGE_DRAFT_PROMPT, PERSON_NOTE_PROMPT } from "./prompts";

export const MODEL = "claude-opus-5-5";

export async function claude<T extends z.ZodType>(system: string, input: unknown, schema: T, label: string): Promise<z.infer<T> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(`ANTHROPIC_API_KEY not set: ${label} skipped`);
    return null;
  }
  const client = new Anthropic({ apiKey });
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: JSON.stringify(input) }],
    output_config: { format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    console.log(`${label}: no output (stop_reason ${response.stop_reason})`);
    return null;
  }
  return response.parsed_output as z.infer<T>;
}

export const isoDay = (at: number) => new Date(at).toISOString().slice(0, 10);
const firstName = (name: string) => name.split(" ")[0];

export const noteInput = internalQuery({
  args: { userKey: v.optional(v.string()), personId: v.id("people"), now: v.number() },
  handler: async (ctx, { userKey, personId, now }) => {
    const user = await userByKey(ctx, userKey);
    const person = await ctx.db.get(personId);
    if (!person || person.ownerId !== user._id) return null;
    const updates = await ctx.db
      .query("updates")
      .withIndex("by_person_at", (q) => q.eq("personId", personId))
      .order("desc")
      .take(20);
    const upcoming: Array<{ what: string; date: string }> = [];
    const birthday = nextBirthday(person.birthday, now);
    if (birthday && birthday.days <= 30) {
      const year = person.birthday?.split("-")[2];
      upcoming.push({ what: year ? `birthday, turns ${new Date(birthday.at).getUTCFullYear() - Number(year)}` : "birthday", date: isoDay(birthday.at) });
    }
    for (const u of updates) {
      if (u.kind === "event" && u.eventAt && u.eventAt >= now) upcoming.push({ what: u.text, date: isoDay(u.eventAt) });
    }
    return {
      today: isoDay(now),
      firstName: firstName(person.name),
      pronoun: person.pronoun ?? null,
      recentUpdates: updates
        .filter((u) => u.at <= now && u.at >= now - 30 * DAY && u.kind !== "event")
        .slice(0, 8)
        .map((u) => ({ kind: u.kind, text: u.text, source: u.source, date: isoDay(u.at), until: u.until ? isoDay(u.until) : null })),
      upcoming,
      lastContacted: person.lastContactAt ? isoDay(person.lastContactAt) : null,
      overlaps: [],
    };
  },
});

export const personNote = action({
  args: { userKey: v.optional(v.string()), personId: v.id("people"), now: v.optional(v.number()) },
  handler: async (ctx, { userKey, personId, now }): Promise<{ note: string }> => {
    const input = await ctx.runQuery(internal.assistant.noteInput, { userKey, personId, now: now ?? Date.now() });
    if (!input) return { note: "" };
    const out = await claude(PERSON_NOTE_PROMPT, input, z.object({ note: z.string() }), "assistant.personNote");
    return { note: out?.note.trim() ?? "" };
  },
});

export const draftInput = internalQuery({
  args: { userKey: v.optional(v.string()), personId: v.id("people") },
  handler: async (ctx, { userKey, personId }) => {
    const user = await userByKey(ctx, userKey);
    const person = await ctx.db.get(personId);
    if (!person || person.ownerId !== user._id) return null;
    return { firstName: firstName(person.name), howTheyKnowEachOther: person.close ? "close friend" : null };
  },
});

export async function draftFor(ctx: ActionCtx, userKey: string | undefined, personId: Id<"people">, reason: string, pastMessages: string[] = []) {
  const who = await ctx.runQuery(internal.assistant.draftInput, { userKey, personId });
  if (!who) return [];
  const out = await claude(
    MESSAGE_DRAFT_PROMPT,
    { recipient: who.firstName, prompt: reason, howTheyKnowEachOther: who.howTheyKnowEachOther, pastMessages },
    z.object({ options: z.array(z.string()) }),
    "assistant.draftMessage",
  );
  return (out?.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 2);
}

export const draftMessage = action({
  args: { userKey: v.optional(v.string()), personId: v.id("people"), reason: v.string(), pastMessages: v.optional(v.array(v.string())) },
  handler: async (ctx, { userKey, personId, reason, pastMessages }): Promise<{ options: string[] }> => ({
    options: await draftFor(ctx, userKey, personId, reason, pastMessages),
  }),
});
