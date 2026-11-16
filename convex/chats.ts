import { makeFunctionReference } from "convex/server";
import { v, type Infer } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, httpAction, internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { claude, isoDay } from "./assistant";
import { DAY, userByKey } from "./lib";
import { safeEqual } from "./payments";
import { chatSource } from "./schema";
import { e164 } from "../src/lib/chats/types";

const MAX_PER_THREAD = 2000;
const SLICE = 800;
const CONVERSATION_GAP = 6 * 60 * 60 * 1000;
const NEW_PERSON_MIN = 30;
const NEW_GROUP_PERSON_MIN = 40;
const EXTRACT_TOP = 8;

const messageArg = v.object({ id: v.optional(v.string()), at: v.number(), fromMe: v.boolean(), sender: v.optional(v.string()), text: v.string() });
const threadArg = v.object({
  externalId: v.string(),
  title: v.string(),
  isGroup: v.boolean(),
  participants: v.array(v.object({ id: v.string(), name: v.optional(v.string()), phone: v.optional(v.string()) })),
  messages: v.array(messageArg),
});
type ThreadIn = Infer<typeof threadArg>;
type Source = Infer<typeof chatSource>;
type Tier = Doc<"relationshipStats">["tier"];

const rememberNoteRef = makeFunctionReference<"action", { personId: Id<"people">; id: string; content: string; metadata: Record<string, string> }, unknown>("memory:rememberNote");
const refreshFeedRef = makeFunctionReference<"action", { userId: Id<"users"> }, unknown>("agent:refreshFeed");

export const normName = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const firstName = (name: string) => name.trim().split(/\s+/)[0];
const hueFor = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", imessage: "iMessage" };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [k, clean(x)]));
  return value;
}

function normalizeThreads(raw: unknown): ThreadIn[] {
  if (!Array.isArray(raw)) throw new Error("threads must be an array");
  return raw.map((t: any) => ({
    externalId: String(t.externalId),
    title: String(t.title ?? "Chat").slice(0, 200),
    isGroup: !!t.isGroup,
    participants: (Array.isArray(t.participants) ? t.participants : []).map((p: any) =>
      clean({ id: String(p.id), name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 120) : undefined, phone: e164(p.phone) }),
    ) as ThreadIn["participants"],
    messages: (Array.isArray(t.messages) ? t.messages : [])
      .filter((m: any) => typeof m?.text === "string" && m.text.trim() && Number.isFinite(Number(m.at)))
      .map((m: any) => clean({ id: typeof m.id === "string" ? m.id : undefined, at: Number(m.at), fromMe: !!m.fromMe, sender: typeof m.sender === "string" ? m.sender : undefined, text: m.text.slice(0, 1000) })) as ThreadIn["messages"],
  }));
}

function matchPerson(people: Doc<"people">[], p: { name?: string; phone?: string; id: string }): Id<"people"> | undefined {
  const phone = p.phone ?? e164(p.id);
  if (phone) {
    const hit = people.find((x) => x.phone && e164(x.phone) === phone);
    if (hit) return hit._id;
  }
  if (p.id.includes("@") && !p.id.includes("whatsapp")) {
    const hit = people.find((x) => x.email && x.email.toLowerCase() === p.id.toLowerCase());
    if (hit) return hit._id;
  }
  if (!p.name) return undefined;
  const full = normName(p.name);
  if (!full) return undefined;
  const exact = people.filter((x) => normName(x.name) === full);
  if (exact.length === 1) return exact[0]._id;
  const parts = p.name.trim().split(/\s+/);
  const first = normName(parts[0]);
  const lastInitial = parts.length > 1 ? normName(parts[parts.length - 1])[0] : undefined;
  const byFirst = people.filter((x) => normName(firstName(x.name)) === first && (!lastInitial || normName(x.name.split(/\s+/).slice(-1)[0])[0] === lastInitial));
  return byFirst.length === 1 ? byFirst[0]._id : undefined;
}

async function ingestThread(ctx: MutationCtx, ownerId: Id<"users">, source: Source, via: string, t: ThreadIn) {
  const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
  let thread = await ctx.db.query("chatThreads").withIndex("by_owner_ext", (q) => q.eq("ownerId", ownerId).eq("externalId", t.externalId)).unique();
  const participants = new Map((thread?.participants ?? []).map((p) => [p.id, p]));
  for (const p of t.participants) {
    const prev = participants.get(p.id);
    const merged = { ...prev, ...p, name: p.name ?? prev?.name, phone: p.phone ?? prev?.phone };
    participants.set(p.id, { ...merged, personId: prev?.personId ?? matchPerson(people, merged) });
  }
  if (!thread) {
    const id = await ctx.db.insert("chatThreads", { ownerId, source, via, externalId: t.externalId, title: t.title, isGroup: t.isGroup, participants: [], messageCount: 0, lastAt: 0, at: Date.now() });
    thread = (await ctx.db.get(id))!;
  }
  let added = 0;
  for (const m of t.messages) {
    const key = m.id ?? `${m.at}:${m.fromMe ? 1 : 0}:${m.sender ?? ""}:${hash(m.text)}`;
    const dupe = await ctx.db.query("chatMessages").withIndex("by_thread_key", (q) => q.eq("threadId", thread._id).eq("key", key)).first();
    if (dupe) continue;
    await ctx.db.insert("chatMessages", { threadId: thread._id, key, at: m.at, fromMe: m.fromMe, sender: m.sender, text: m.text });
    added++;
    if (!m.fromMe && m.sender) {
      const p = participants.get(m.sender);
      if (p) participants.set(m.sender, { ...p, count: (p.count ?? 0) + 1, lastAt: Math.max(p.lastAt ?? 0, m.at) });
    }
  }
  let count = thread.messageCount + added;
  if (count > MAX_PER_THREAD) {
    const old = await ctx.db.query("chatMessages").withIndex("by_thread_at", (q) => q.eq("threadId", thread._id)).order("asc").take(count - MAX_PER_THREAD);
    for (const o of old) await ctx.db.delete(o._id);
    count -= old.length;
  }
  const list = [...participants.values()];
  const lastAt = Math.max(thread.lastAt, ...t.messages.map((m) => m.at));
  const isGroup = thread.isGroup || t.isGroup || list.length > 1;
  await ctx.db.patch(thread._id, {
    title: t.title || thread.title,
    via,
    isGroup,
    participants: list,
    personId: isGroup ? undefined : list[0]?.personId,
    messageCount: count,
    lastAt,
    at: Date.now(),
  });
  return added;
}

export const ingestSlice = internalMutation({
  args: { userKey: v.string(), source: chatSource, via: v.string(), thread: threadArg },
  handler: async (ctx, { userKey, source, via, thread }) => {
    const user = await userByKey(ctx, userKey);
    return await ingestThread(ctx, user._id, source, via, thread);
  },
});

async function ingestAll(ctx: { runMutation: any; scheduler: any }, userKey: string, source: Source, via: string, threads: ThreadIn[]) {
  let added = 0;
  let messages = 0;
  for (const t of threads) {
    const sorted = [...t.messages].sort((a, b) => a.at - b.at).slice(-MAX_PER_THREAD);
    messages += sorted.length;
    for (let i = 0; i < Math.max(1, sorted.length); i += SLICE) {
      added += await ctx.runMutation(internal.chats.ingestSlice, { userKey, source, via, thread: { ...t, messages: sorted.slice(i, i + SLICE) } });
    }
  }
  await ctx.runMutation(internal.chats.scheduleRecompute, { userKey });
  return { ok: true, threads: threads.length, messages, added };
}

export const scheduleRecompute = internalMutation({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    await ctx.scheduler.runAfter(3000, internal.chats.recompute, { userKey });
  },
});

export const importThreads = action({
  args: { userKey: v.optional(v.string()), source: chatSource, via: v.string(), threads: v.any() },
  handler: async (ctx, { userKey, source, via, threads }): Promise<{ ok: boolean; threads: number; messages: number; added: number }> => {
    return await ingestAll(ctx, userKey ?? "alex", source, via, normalizeThreads(threads));
  },
});

export const ingestHttp = httpAction(async (ctx, request) => {
  const secret = process.env.BRIDGE_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (!secret || !token || !safeEqual(token, secret)) return json({ ok: false, error: "unauthorized" }, 401);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  if (body?.source !== "whatsapp" && body?.source !== "imessage") return json({ ok: false, error: "source must be whatsapp or imessage" }, 400);
  try {
    const result = await ingestAll(ctx, typeof body.userKey === "string" ? body.userKey : "alex", body.source, String(body.via ?? "bridge"), normalizeThreads(body.threads));
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

export const recompute = internalMutation({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const threads = await ctx.db.query("chatThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    let people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();

    let created = 0;
    const createdByParticipant = new Map<string, Id<"people">>();
    for (const t of threads) {
      let changed = false;
      const participants = t.participants.map((p) => {
        if (p.personId) return p;
        const matched = matchPerson(people, p) ?? createdByParticipant.get(p.id);
        if (matched) {
          changed = true;
          return { ...p, personId: matched };
        }
        return p;
      });
      for (const [i, p] of participants.entries()) {
        if (p.personId || created >= 15) continue;
        const frequent = t.isGroup ? (p.count ?? 0) >= NEW_GROUP_PERSON_MIN : t.messageCount >= NEW_PERSON_MIN;
        const recent = (p.lastAt ?? t.lastAt) > Date.now() - 365 * DAY;
        const realName = !!p.name && /\p{L}{2,}/u.test(p.name) && !/^[+\d\s().-]+$/.test(p.name) && !p.name.includes("@");
        if (!frequent || !recent || !realName) continue;
        const name = p.name!;
        const personId = await ctx.db.insert("people", {
          ownerId: user._id,
          key: `chat:${p.id}`,
          name,
          hue: hueFor(name),
          city: "",
          role: "",
          handles: {},
          interests: [],
          phone: p.phone,
          close: false,
          source: t.source,
        });
        createdByParticipant.set(p.id, personId);
        participants[i] = { ...p, personId };
        created++;
        changed = true;
      }
      if (changed) await ctx.db.patch(t._id, { participants, personId: t.isGroup ? undefined : participants[0]?.personId });
    }
    if (created) people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();

    const fresh = await ctx.db.query("chatThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const pairs = new Map<string, { a: Id<"people">; b: Id<"people">; titles: string[] }>();
    const groupInfo = new Map<Id<"people">, { groups: number; messages: number; lastAt: number }>();
    const personIds = new Set<Id<"people">>();
    for (const t of fresh) {
      if (!t.isGroup) {
        if (t.personId) personIds.add(t.personId);
        continue;
      }
      const ids = [...new Set(t.participants.map((p) => p.personId).filter((x): x is Id<"people"> => !!x))].sort();
      for (const p of t.participants) {
        if (!p.personId) continue;
        personIds.add(p.personId);
        const g = groupInfo.get(p.personId) ?? { groups: 0, messages: 0, lastAt: 0 };
        groupInfo.set(p.personId, { groups: g.groups + 1, messages: g.messages + (p.count ?? 0), lastAt: Math.max(g.lastAt, p.lastAt ?? 0) });
      }
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = ids[i] + ":" + ids[j];
          const e = pairs.get(k) ?? { a: ids[i], b: ids[j], titles: [] };
          e.titles.push(t.title);
          pairs.set(k, e);
        }
    }
    for (const e of await ctx.db.query("chatEdges").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect()) await ctx.db.delete(e._id);
    for (const e of pairs.values()) await ctx.db.insert("chatEdges", { ownerId: user._id, personId: e.a, otherPersonId: e.b, groups: e.titles.length, groupTitles: e.titles.slice(0, 5), at: Date.now() });

    let i = 0;
    for (const personId of personIds) {
      const g = groupInfo.get(personId) ?? { groups: 0, messages: 0, lastAt: 0 };
      await ctx.scheduler.runAfter(i++ * 200, internal.chats.recomputePerson, { personId, groupsTogether: g.groups, groupMessages: g.messages, groupLastAt: g.lastAt });
    }
    await ctx.scheduler.runAfter(i * 200 + 5000, internal.chats.planExtraction, { userId: user._id });
    return { threads: fresh.length, people: personIds.size, created, edges: pairs.size };
  },
});

function median(xs: number[]) {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export const recomputePerson = internalMutation({
  args: { personId: v.id("people"), groupsTogether: v.number(), groupMessages: v.number(), groupLastAt: v.number() },
  handler: async (ctx, { personId, groupsTogether, groupMessages, groupLastAt }) => {
    const person = await ctx.db.get(personId);
    if (!person) return;
    const now = Date.now();
    const threads = await ctx.db.query("chatThreads").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
    const msgs: Array<{ at: number; fromMe: boolean }> = [];
    for (const t of threads) {
      const rows = await ctx.db.query("chatMessages").withIndex("by_thread_at", (q) => q.eq("threadId", t._id)).collect();
      for (const r of rows) msgs.push({ at: r.at, fromMe: r.fromMe });
    }
    msgs.sort((a, b) => a.at - b.at);
    const sentByMe = msgs.filter((m) => m.fromMe).length;
    const last30 = msgs.filter((m) => m.at >= now - 30 * DAY).length;
    const prev60 = msgs.filter((m) => m.at < now - 30 * DAY && m.at >= now - 90 * DAY).length;
    const activeDays90 = new Set(msgs.filter((m) => m.at >= now - 90 * DAY).map((m) => Math.floor(m.at / DAY))).size;
    let startsByMe = 0;
    let startsByThem = 0;
    const mine: number[] = [];
    const theirs: number[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const prev = msgs[i - 1];
      const m = msgs[i];
      if (!prev || m.at - prev.at > CONVERSATION_GAP) {
        if (m.fromMe) startsByMe++;
        else startsByThem++;
      } else if (prev.fromMe !== m.fromMe) (m.fromMe ? mine : theirs).push(m.at - prev.at);
    }
    const lastAt = msgs.length ? msgs[msgs.length - 1].at : groupLastAt || undefined;
    const days = lastAt ? (now - lastAt) / DAY : Infinity;
    let tier: Tier;
    if (msgs.length === 0) tier = days <= 90 ? "catching_up" : "dormant";
    else if (days <= 14 && (last30 >= 60 || activeDays90 >= 30)) tier = "inner";
    else if (days <= 45 && (last30 + prev60 >= 20 || activeDays90 >= 8)) tier = "close";
    else if (days <= 180) tier = "catching_up";
    else tier = "dormant";
    const before = prev60 / 2;
    const trend = last30 >= before * 1.4 + 3 ? "warming" : last30 <= before * 0.6 - 2 || (days > 30 && before >= 10) ? "cooling" : "steady";
    const sources = [...new Set(threads.map((t) => t.source))];
    const stats = {
      ownerId: person.ownerId,
      personId,
      sources,
      messageCount: msgs.length,
      sentByMe,
      groupMessages,
      groupsTogether,
      firstAt: msgs[0]?.at,
      lastAt,
      last30,
      prev60,
      activeDays90,
      startsByMe,
      startsByThem,
      myReplyMs: median(mine),
      theirReplyMs: median(theirs),
      tier,
      trend: trend as Doc<"relationshipStats">["trend"],
      at: now,
    };
    const existing = await ctx.db.query("relationshipStats").withIndex("by_person", (q) => q.eq("personId", personId)).unique();
    if (existing) await ctx.db.patch(existing._id, stats);
    else await ctx.db.insert("relationshipStats", stats);
    const talked = msgs.length ? msgs[msgs.length - 1].at : undefined;
    if (talked && (!person.lastContactAt || talked > person.lastContactAt)) await ctx.db.patch(personId, { lastContactAt: talked });
  },
});

export const resetUser = internalMutation({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    let messages = 0;
    const threads = await ctx.db.query("chatThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    for (const t of threads) {
      const rows = await ctx.db.query("chatMessages").withIndex("by_thread_at", (q) => q.eq("threadId", t._id)).take(3000 - messages);
      for (const r of rows) await ctx.db.delete(r._id);
      messages += rows.length;
      if (messages >= 3000) return { done: false, messages };
    }
    for (const t of threads) await ctx.db.delete(t._id);
    const stats = await ctx.db.query("relationshipStats").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    for (const s of stats) await ctx.db.delete(s._id);
    const edges = await ctx.db.query("chatEdges").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    for (const e of edges) await ctx.db.delete(e._id);
    const reminders = (await ctx.db.query("reminders").withIndex("by_owner_fireAt", (q) => q.eq("ownerId", user._id)).collect()).filter((r) => r.sourceId?.startsWith("chat:"));
    for (const r of reminders) await ctx.db.delete(r._id);
    const updates = (await ctx.db.query("updates").withIndex("by_owner_at", (q) => q.eq("ownerId", user._id)).collect()).filter((u) => /^(WhatsApp|iMessage)( and (WhatsApp|iMessage))?$/.test(u.source));
    for (const u of updates) await ctx.db.delete(u._id);
    const people = (await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect()).filter((p) => p.source === "whatsapp" || p.source === "imessage");
    for (const p of people) {
      for (const r of await ctx.db.query("reminders").withIndex("by_owner_fireAt", (q) => q.eq("ownerId", user._id)).collect()) if (r.personId === p._id) await ctx.db.delete(r._id);
      for (const u of await ctx.db.query("updates").withIndex("by_person_at", (q) => q.eq("personId", p._id)).collect()) await ctx.db.delete(u._id);
      await ctx.db.delete(p._id);
    }
    return { done: true, messages, threads: threads.length, stats: stats.length, edges: edges.length, reminders: reminders.length, updates: updates.length, people: people.map((p) => p.name) };
  },
});

export const planExtraction = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const stats = await ctx.db.query("relationshipStats").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    const due = stats
      .filter((s) => s.messageCount >= 10 && s.lastAt && (!s.extractedLastAt || s.lastAt > s.extractedLastAt) && (!s.extractedAt || s.extractedAt < Date.now() - 10 * 60 * 1000))
      .sort((a, b) => b.last30 + b.prev60 / 3 - (a.last30 + a.prev60 / 3))
      .slice(0, EXTRACT_TOP);
    for (const [i, s] of due.entries()) {
      await ctx.db.patch(s._id, { extractedAt: Date.now() });
      await ctx.scheduler.runAfter(i * 4000, internal.chats.extract, { personId: s.personId });
    }
    await ctx.scheduler.runAfter(due.length * 4000 + 90_000, refreshFeedRef, { userId });
    return due.length;
  },
});

export const extractInput = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return null;
    const user = await ctx.db.get(person.ownerId);
    const threads = await ctx.db.query("chatThreads").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
    const since = Date.now() - 120 * DAY;
    const lines: Array<{ at: number; line: string }> = [];
    for (const t of threads) {
      const rows = await ctx.db.query("chatMessages").withIndex("by_thread_at", (q) => q.eq("threadId", t._id).gte("at", since)).order("desc").take(150);
      for (const r of rows) lines.push({ at: r.at, line: `${isoDay(r.at)} ${r.fromMe ? "Me" : firstName(person.name)}: ${r.text.slice(0, 300)}` });
    }
    lines.sort((a, b) => a.at - b.at);
    return {
      person: { name: person.name, city: person.city, birthday: person.birthday ?? null },
      userName: user?.name ?? "the user",
      lastAt: lines.length ? lines[lines.length - 1].at : 0,
      sources: [...new Set(threads.map((t) => t.source))],
      messages: lines.slice(-150).map((l) => l.line),
    };
  },
});

type ExtractInput = { person: { name: string; city: string; birthday: string | null }; userName: string; lastAt: number; sources: string[]; messages: string[] };

const EXTRACT_PROMPT = [
  "You read a slice of the user's private text conversation with one friend and pull out a few durable, useful facts about the friend, so a personal assistant can remember birthdays, plans and gift ideas.",
  "Return only facts that are clearly stated. Paraphrase in one short plain sentence in the third person; never quote the messages or copy distinctive phrases.",
  "Kinds: birthday (the friend's birthday; set date to YYYY-MM-DD using the year it falls next, or the year if unknown), plan (a concrete upcoming plan with the user or a trip; set date YYYY-MM-DD only when the day is clear), move (the friend recently moved or is about to move to another city; city only; not trips or visits), job (only a new job or a change of role that just happened or is about to; never someone's ongoing work), preference (likes, dislikes, food, hobbies), gift_hint (something they want or would love).",
  "Locations: city level only. Never an address, neighbourhood, venue address or coordinates.",
  "Never include anything about health, illness, pregnancy, grief or death, breakups or relationship trouble, money, debts or salaries, legal or immigration matters, religion or politics. Skip them entirely.",
  "At most 6 facts. Plans must be in the future relative to today. If nothing qualifies, return an empty list.",
].join("\n");

const factSchema = z.object({
  facts: z.array(
    z.object({
      kind: z.enum(["birthday", "plan", "move", "job", "preference", "gift_hint"]),
      summary: z.string(),
      date: z.string().nullable(),
      city: z.string().nullable(),
    }),
  ),
});

export const extract = internalAction({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }): Promise<{ facts: number }> => {
    const input: ExtractInput | null = await ctx.runQuery(internal.chats.extractInput, { personId });
    if (!input || input.messages.length < 10) return { facts: 0 };
    const today = isoDay(Date.now());
    const out = await claude(EXTRACT_PROMPT, { today, friend: input.person, user: input.userName, conversation: input.messages }, factSchema, "chats.extract");
    const facts = out?.facts ?? [];
    const source = input.sources.map((s) => SOURCE_LABEL[s] ?? s).join(" and ");
    for (const f of facts) {
      try {
        await ctx.runAction(rememberNoteRef, {
          personId,
          id: `chat_${personId}_${hash(f.kind + f.summary)}`,
          content: `${today}: From ${source} chats with ${input.person.name}: ${f.summary}`,
          metadata: { type: "chat", kind: f.kind, date: today },
        });
      } catch (e) {
        console.log("chats.extract: memory unavailable", e instanceof Error ? e.message : e);
      }
    }
    await ctx.runMutation(internal.chats.applyFacts, { personId, facts, source, lastAt: input.lastAt });
    return { facts: facts.length };
  },
});

export const applyFacts = internalMutation({
  args: {
    personId: v.id("people"),
    source: v.string(),
    lastAt: v.number(),
    facts: v.array(v.object({ kind: v.string(), summary: v.string(), date: v.union(v.string(), v.null()), city: v.union(v.string(), v.null()) })),
  },
  handler: async (ctx, { personId, source, lastAt, facts }) => {
    const person = await ctx.db.get(personId);
    if (!person) return;
    const now = Date.now();
    for (const f of facts) {
      const date = f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : null;
      if (f.kind === "birthday" && date && !person.birthday) {
        const [, m, d] = date.split("-");
        await ctx.db.patch(personId, { birthday: `${m}-${d}` });
      }
      if (f.kind === "plan" && date) {
        const fireAt = Date.parse(`${date}T14:00:00Z`);
        if (!Number.isFinite(fireAt) || fireAt < now) continue;
        const sourceId = `chat:${personId}:${date}:${hash(f.summary)}`;
        const dupe = await ctx.db.query("reminders").withIndex("by_owner_sourceId", (q) => q.eq("ownerId", person.ownerId).eq("sourceId", sourceId)).first();
        const sameDay = (await ctx.db.query("reminders").withIndex("by_owner_fireAt", (q) => q.eq("ownerId", person.ownerId).gte("fireAt", fireAt - DAY).lte("fireAt", fireAt + DAY)).collect()).some((r) => r.personId === personId);
        if (!dupe && !sameDay)
          await ctx.db.insert("reminders", {
            ownerId: person.ownerId,
            personId,
            kind: "event",
            title: f.summary.replace(/\.$/, "") + ".",
            body: `From your ${source} chats.`,
            fireAt,
            status: "scheduled",
            channel: "push",
            sourceId,
            createdBy: "kin",
            at: now,
          });
      }
      if ((f.kind === "move" || f.kind === "job") && f.summary) {
        const recent = await ctx.db.query("updates").withIndex("by_person_at", (q) => q.eq("personId", personId).gte("at", now - 30 * DAY)).collect();
        if (recent.some((u) => u.kind === f.kind)) continue;
        await ctx.db.insert("updates", { personId, ownerId: person.ownerId, kind: f.kind, text: f.summary, source, at: Math.min(now, lastAt || now) });
      }
    }
    const stats = await ctx.db.query("relationshipStats").withIndex("by_person", (q) => q.eq("personId", personId)).unique();
    if (stats) await ctx.db.patch(stats._id, { extractedLastAt: lastAt, extractedAt: now });
  },
});

const TIER_LABEL: Record<Tier, string> = { inner: "Inner circle", close: "Close", catching_up: "Catching up", dormant: "Dormant" };

function plural(n: number, one: string, many = one + "s") {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function duration(ms: number | undefined) {
  if (ms === undefined) return null;
  const min = Math.round(ms / 60000);
  if (min < 2) return "within a minute";
  if (min < 60) return `in about ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `in about ${h} h` : "in a day or more";
}

function cadence(activeDays90: number) {
  const perWeek = activeDays90 / 13;
  if (perWeek >= 4) return "most days";
  if (perWeek >= 1) return "every week";
  if (perWeek >= 0.3) return "a few times a month";
  return activeDays90 > 0 ? "now and then" : "rarely lately";
}

export function describeStats(s: Doc<"relationshipStats">, name: string, now: number) {
  const first = firstName(name);
  const starts = s.startsByMe + s.startsByThem;
  const share = starts ? s.startsByMe / starts : 0.5;
  const initiator = starts < 3 ? null : share >= 0.6 ? "you usually text first" : share <= 0.4 ? `${first} usually texts first` : "you both reach out";
  const days = s.lastAt ? Math.floor((now - s.lastAt) / DAY) : null;
  const lastTalked = days === null ? null : days <= 0 ? "talked today" : days === 1 ? "talked yesterday" : days < 60 ? `last talked ${days} days ago` : `last talked ${Math.round(days / 30)} months ago`;
  return {
    tier: s.tier,
    tierLabel: TIER_LABEL[s.tier],
    trend: s.trend,
    messages: s.messageCount,
    messagesLabel: s.messageCount ? plural(s.messageCount, "message") : null,
    sources: s.sources.map((x) => SOURCE_LABEL[x] ?? x),
    cadence: cadence(s.activeDays90),
    initiator,
    theyReply: duration(s.theirReplyMs),
    youReply: duration(s.myReplyMs),
    lastTalkedAt: s.lastAt ?? null,
    lastTalked,
    groupsTogether: s.groupsTogether,
    strip: [TIER_LABEL[s.tier], s.messageCount ? plural(s.messageCount, "message") : s.groupsTogether ? `${plural(s.groupsTogether, "group chat")} together` : null, initiator, lastTalked].filter(Boolean).join(" · "),
  };
}

export const relationship = query({
  args: { personId: v.id("people"), now: v.optional(v.number()) },
  handler: async (ctx, { personId, now }) => {
    const [person, s] = await Promise.all([ctx.db.get(personId), ctx.db.query("relationshipStats").withIndex("by_person", (q) => q.eq("personId", personId)).unique()]);
    if (!person || !s) return null;
    return describeStats(s, person.name, now ?? Date.now());
  },
});

export const relationshipFor = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    const s = await ctx.db.query("relationshipStats").withIndex("by_person", (q) => q.eq("personId", personId)).unique();
    if (!person || !s) return null;
    const edges = [
      ...(await ctx.db.query("chatEdges").withIndex("by_person", (q) => q.eq("personId", personId)).collect()).map((e) => ({ id: e.otherPersonId, groups: e.groups })),
      ...(await ctx.db.query("chatEdges").withIndex("by_other", (q) => q.eq("otherPersonId", personId)).collect()).map((e) => ({ id: e.personId, groups: e.groups })),
    ];
    const sharedGroupsWith = [];
    for (const e of edges.sort((a, b) => b.groups - a.groups).slice(0, 6)) {
      const p = await ctx.db.get(e.id);
      if (p) sharedGroupsWith.push({ name: p.name, personId: p._id, groupChats: e.groups });
    }
    const d = describeStats(s, person.name, Date.now());
    return {
      person: person.name,
      personId,
      closeness: d.tierLabel,
      trend: d.trend,
      messages: s.messageCount,
      messagesLast30Days: s.last30,
      talk: d.cadence,
      whoStarts: d.initiator,
      theyUsuallyReply: d.theyReply,
      youUsuallyReply: d.youReply,
      lastTalked: s.lastAt ? isoDay(s.lastAt) : null,
      groupChatsTogether: s.groupsTogether,
      inGroupChatsWith: sharedGroupsWith,
      from: d.sources,
    };
  },
});

export const catchUp = internalQuery({
  args: { userKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userKey, limit }) => {
    const user = await userByKey(ctx, userKey);
    const now = Date.now();
    const stats = await ctx.db.query("relationshipStats").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const scored = stats
      .filter((s) => s.lastAt && s.messageCount >= 20)
      .map((s) => {
        const days = (now - s.lastAt!) / DAY;
        const usualGap = s.activeDays90 ? 90 / s.activeDays90 : 30;
        const overdue = days / Math.max(2, usualGap);
        const weight = Math.log10(s.messageCount + 10) * (s.tier === "inner" ? 1.6 : s.tier === "close" ? 1.3 : 1);
        return { s, days, score: (overdue + (s.trend === "cooling" ? 1.5 : 0)) * weight };
      })
      .filter((x) => x.days >= 7 && (x.s.trend === "cooling" || x.score > 2))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit ?? 5);
    const out = [];
    for (const x of scored) {
      const p = await ctx.db.get(x.s.personId);
      if (!p) continue;
      const d = describeStats(x.s, p.name, now);
      out.push({ personId: p._id, name: p.name, closeness: d.tierLabel, trend: x.s.trend, lastTalked: d.lastTalked, usually: d.cadence, whoStarts: d.initiator, messages: x.s.messageCount });
    }
    return out;
  },
});

export const relationshipsFor = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const stats = await ctx.db.query("relationshipStats").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    const edges = await ctx.db.query("chatEdges").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    const peers = new Map<Id<"people">, Array<{ personId: Id<"people">; groups: number }>>();
    for (const e of edges) {
      peers.set(e.personId, [...(peers.get(e.personId) ?? []), { personId: e.otherPersonId, groups: e.groups }]);
      peers.set(e.otherPersonId, [...(peers.get(e.otherPersonId) ?? []), { personId: e.personId, groups: e.groups }]);
    }
    return stats.map((s) => ({
      personId: s.personId,
      tier: s.tier,
      messageCount: s.messageCount,
      lastTalkedAt: s.lastAt ?? null,
      trend: s.trend,
      groupsTogether: s.groupsTogether,
      groupPeers: (peers.get(s.personId) ?? []).map((x) => x.personId),
      groupPeerCounts: peers.get(s.personId) ?? [],
    }));
  },
});

export const status = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const threads = await ctx.db.query("chatThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const stats = await ctx.db.query("relationshipStats").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const messages = threads.reduce((n, t) => n + t.messageCount, 0);
    const sources = [...new Set(threads.map((t) => t.source))].map((s) => SOURCE_LABEL[s] ?? s);
    const last = threads.reduce((m, t) => Math.max(m, t.at), 0);
    return {
      threads: threads.length,
      messages,
      people: stats.length,
      sources,
      syncedAt: last || null,
      bridge: threads.some((t) => t.via === "bridge"),
      line: messages ? `${plural(messages, "message")} · ${plural(stats.length, "person", "people")}` : null,
    };
  },
});

export const bridge = query({
  args: {},
  handler: async () => ({ url: process.env.BRIDGE_URL ?? null }),
});

async function bridgeCall(path: string, body?: unknown) {
  const url = process.env.BRIDGE_URL;
  const secret = process.env.BRIDGE_SECRET;
  if (!url || !secret) throw new Error("The WhatsApp bridge is not running.");
  const res = await fetch(url.replace(/\/$/, "") + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(json?.error ?? `Bridge error ${res.status}`);
  return json;
}

export const connectWhatsApp = action({
  args: { userKey: v.optional(v.string()), phone: v.string() },
  handler: async (_ctx, { phone }): Promise<{ code: string }> => {
    const number = e164(phone);
    if (!number) throw new Error("Enter your number with the country code.");
    const out = await bridgeCall("/pair", { phone: number });
    const code = String(out?.code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!code) throw new Error("No pairing code came back. Try again.");
    return { code };
  },
});

export const whatsAppStatus = action({
  args: { userKey: v.optional(v.string()) },
  handler: async (): Promise<{ state: string; phone?: string; lastSyncAt?: number; messages?: number }> => {
    try {
      const s = await bridgeCall("/status");
      return { state: String(s?.state ?? "idle"), phone: s?.phone ?? undefined, lastSyncAt: s?.lastSyncAt ?? undefined, messages: s?.messages ?? undefined };
    } catch {
      return { state: "offline" };
    }
  },
});
