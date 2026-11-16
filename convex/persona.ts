import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { claude } from "./assistant";
import { userByKey } from "./lib";

export type PersonaView = {
  headline: string;
  bio: string;
  workingOn: string;
  interests: string[];
  voice: string;
  reach: string;
  mayShare: string;
  shareCity: boolean;
  styleSource?: string;
  builtAt?: number;
};

const first = (name: string) => name.split(" ")[0];

async function selfRow(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db.query("people").withIndex("by_linked_user", (q) => q.eq("linkedUserId", userId)).first();
}

function defaults(user: Doc<"users">, me: Doc<"people"> | null): PersonaView {
  const reach = [me?.handles.linkedin && `LinkedIn: linkedin.com/in/${me.handles.linkedin}`, me?.handles.x && `X: @${me.handles.x}`].filter(Boolean).join(" · ");
  return {
    headline: `${user.role} in ${user.city}`,
    bio: `${first(user.name)} is a ${user.role.toLowerCase()} based in ${user.city}.`,
    workingOn: "",
    interests: me?.interests ?? [],
    voice: "Warm, brief and direct. One to three sentences. Plain words, no emoji, no exclamation marks.",
    reach,
    mayShare: "My work, my interests, and when I'm free to meet.",
    shareCity: user.visibility.city,
  };
}

export async function personaFor(ctx: QueryCtx, user: Doc<"users">): Promise<{ persona: PersonaView; stored: boolean }> {
  const row = await ctx.db.query("personas").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).unique();
  if (row) {
    const { _id, _creationTime, ownerId, at, ...persona } = row;
    return { persona, stored: true };
  }
  return { persona: defaults(user, await selfRow(ctx, user._id)), stored: false };
}

export const get = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const { persona, stored } = await personaFor(ctx, user);
    return { name: user.name, hue: user.hue, city: user.city, persona, stored, siteUrl: process.env.CONVEX_SITE_URL ?? null };
  },
});

const patchArgs = {
  headline: v.optional(v.string()),
  bio: v.optional(v.string()),
  workingOn: v.optional(v.string()),
  interests: v.optional(v.array(v.string())),
  voice: v.optional(v.string()),
  reach: v.optional(v.string()),
  mayShare: v.optional(v.string()),
  shareCity: v.optional(v.boolean()),
};

export const update = mutation({
  args: { userKey: v.optional(v.string()), ...patchArgs },
  handler: async (ctx, { userKey, ...patch }) => {
    const user = await userByKey(ctx, userKey);
    const { persona } = await personaFor(ctx, user);
    const clean = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<PersonaView>;
    const next = { ...persona, ...clean, at: Date.now() };
    const row = await ctx.db.query("personas").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).unique();
    if (row) await ctx.db.replace(row._id, { ownerId: user._id, ...next });
    else await ctx.db.insert("personas", { ownerId: user._id, ...next });
  },
});

export const buildInput = internalQuery({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const me = await selfRow(ctx, user._id);
    const updates = me ? await ctx.db.query("updates").withIndex("by_person_at", (q) => q.eq("personId", me._id)).order("desc").take(12) : [];
    const shares = await ctx.db.query("shares").withIndex("by_author", (q) => q.eq("authorId", user._id)).order("desc").take(20);
    const agentThread = await ctx.db.query("agentThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).first();
    const agentTexts = agentThread
      ? (await ctx.db.query("agentMessages").withIndex("by_thread_at", (q) => q.eq("threadId", agentThread._id)).order("desc").take(80))
          .filter((m) => m.role === "user" && !m.action)
          .map((m) => m.text)
      : [];
    const outgoing: string[] = [];
    const threads = await ctx.db.query("chatThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).take(60);
    for (const t of threads.sort((a, b) => b.lastAt - a.lastAt).slice(0, 25)) {
      const rows = await ctx.db.query("chatMessages").withIndex("by_thread_at", (q) => q.eq("threadId", t._id)).order("desc").take(60);
      for (const m of rows) if (m.fromMe && m.text.length >= 3 && m.text.length <= 280) outgoing.push(m.text);
      if (outgoing.length >= 160) break;
    }
    const current = await personaFor(ctx, user);
    return {
      name: user.name,
      role: user.role,
      city: user.city,
      interests: me?.interests ?? [],
      handles: me?.handles ?? {},
      publicUpdates: updates.filter((u) => u.kind === "job" || u.kind === "milestone" || u.kind === "post").map((u) => ({ text: u.text, source: u.source })),
      shares: shares.map((s) => s.text),
      styleSamples: (outgoing.length >= 15 ? outgoing : [...shares.map((s) => s.text), ...agentTexts]).slice(0, 160),
      styleSource: outgoing.length >= 15 ? "chats" : shares.length + agentTexts.length > 0 ? "shares and Kin chat" : "profile",
      current: current.persona,
    };
  },
});

const BUILD_PROMPT = `You write the public persona for a person's Kin agent: an AI agent that other people (or their agents) can chat with to learn what this person works on and to book time with them. The agent speaks in this person's voice, so you also write a short style guide.

You receive the person's profile, public updates, things they posted on Kin, and style samples: short messages they wrote themselves. Style samples are private. Use them only to describe how the person writes. Never quote them, never copy a phrase longer than three words, and never mention any fact, name, place, plan or person that appears only in them.

Return:
- headline: role and city in under 8 words, e.g. "Product manager in New York".
- bio: two sentences, first person, plain, from the profile and public updates only.
- workingOn: one or two sentences, first person, about their work, based only on the profile and public updates. If there is nothing specific, describe the role in general terms. Never invent a company, product or project.
- interests: up to 6 short public interests.
- voice: a style guide of at most 70 words that an agent writing one-to-three-sentence replies can follow to sound like this person: tone, typical message length, punctuation and capitalisation habits, emoji use (say how often, or "none"), and two or three signature phrasings described in general terms (not quoted from samples).
- Never mention a neighbourhood, street, address, venue or any place more precise than the city, and never mention family, health, money or relationships, even if the inputs do.
- reach: how to reach them professionally, using only public handles given (LinkedIn, X, website). Never a phone number, email or address. Empty string if none.`;

export const save = internalMutation({
  args: { userKey: v.optional(v.string()), headline: v.string(), bio: v.string(), workingOn: v.string(), interests: v.array(v.string()), voice: v.string(), reach: v.string(), styleSource: v.string() },
  handler: async (ctx, { userKey, ...fields }) => {
    const user = await userByKey(ctx, userKey);
    const { persona } = await personaFor(ctx, user);
    const next = { ...persona, ...fields, builtAt: Date.now(), at: Date.now() };
    const row = await ctx.db.query("personas").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).unique();
    if (row) await ctx.db.replace(row._id, { ownerId: user._id, ...next });
    else await ctx.db.insert("personas", { ownerId: user._id, ...next });
  },
});

export const build = action({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<{ ok: boolean; styleSource: string }> => {
    const input = await ctx.runQuery(internal.persona.buildInput, { userKey });
    const { current, styleSource, ...rest } = input;
    const out = await claude(
      BUILD_PROMPT,
      rest,
      z.object({ headline: z.string(), bio: z.string(), workingOn: z.string(), interests: z.array(z.string()), voice: z.string(), reach: z.string() }),
      "persona.build",
    );
    if (!out) return { ok: false, styleSource };
    await ctx.runMutation(internal.persona.save, { userKey, ...out, interests: out.interests.slice(0, 6), styleSource });
    return { ok: true, styleSource };
  },
});
