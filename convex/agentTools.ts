import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { draftFor, isoDay } from "./assistant";
import { suggestGift } from "./gifts";
import { chargeGift } from "./payments";
import { userByKey } from "./lib";

export type Channel = "app" | "imessage";
export type AgentAction = { type: string; payload: any };
export type KeikiTurnRef = { turnUrl: string; mcpUrl: string; agentId: string; turnId: string };
export type ToolEnv = {
  userKey: string;
  userName: string;
  channel: Channel;
  current: { text: string; action?: AgentAction } | null;
  sendGiftUsed: boolean;
  keiki?: KeikiTurnRef;
  emit: (text: string, action: AgentAction) => Promise<void>;
};

const searchWebRef = makeFunctionReference<"action", { query: string; numResults?: number }, { results: Array<{ title: string; url: string; snippet: string; publishedAt?: string }> }>("enrich:searchWeb");
const enrichPersonRef = makeFunctionReference<"action", { personId: Id<"people"> }, { skipped?: boolean; added: number; updated: string[] }>("enrich:person");
const relationshipRef = makeFunctionReference<"query", { personId: Id<"people"> }, Record<string, unknown> | null>("chats:relationshipFor");
const catchUpRef = makeFunctionReference<"query", { userKey: string; limit?: number }, Array<Record<string, unknown>>>("chats:catchUp");
const mutualsRef = makeFunctionReference<"query", { personId: Id<"people"> }, Array<{ personId: string; name: string; via: string }>>("social:mutuals");
const draftDmRef = makeFunctionReference<"action", { personId: Id<"people">; text: string; toolkit?: string }, { toolkit: string; url?: string; draft: string }>("social:draftDm");
const rememberNoteRef = makeFunctionReference<"action", { personId: Id<"people">; id: string; content: string; metadata: Record<string, string> }, unknown>("memory:rememberNote");

export const longDay = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const first = (name: string) => name.split(" ")[0];
const str = (description: string) => ({ type: "string" as const, description });
const who = {
  name: str("The person's name as the user said it, e.g. Maya"),
  personId: str("personId from an earlier tool result, if you have it"),
};
const obj = (properties: Record<string, unknown>, required: string[] = []): Tool["input_schema"] => ({ type: "object", properties, required });

export const TOOLS: Tool[] = [
  {
    name: "get_today",
    description:
      "What is coming up for the user's people in the next week (birthdays, with Kin's suggested gift and its giftId when there is one; events with their updateId and whether the user is going) and what recently changed in their lives (new jobs, moves, trips, milestones, posts), each with its source and personId. Use it for 'what's new', 'anything today' and as the starting point for most questions.",
    input_schema: obj({}),
  },
  {
    name: "get_person",
    description:
      "Everything Kin knows about one person in the user's contacts: role, home city and the city they are in now, birthday, interests, which networks they share on, recent updates (with updateId and source), and gifts already sent. Pass the name as the user said it, or a personId. Fails with a list when several people match; then ask which one.",
    input_schema: obj(who),
  },
  {
    name: "who_is_in",
    description: "Which of the user's people are in a city right now, either living there or visiting (with until when and the source). City level only.",
    input_schema: obj({ city: str("City name, e.g. Lisbon") }, ["city"]),
  },
  {
    name: "search_people",
    description: "Find people in the user's contacts by part of a name, role or company, by home city, or by interest (e.g. running, ceramics). Returns up to 10 people with personId, city, role and interests. Leave a field out to ignore it.",
    input_schema: obj({ query: str("Part of a name, role or company"), city: str("Home city"), interest: str("An interest, e.g. climbing") }),
  },
  {
    name: "search_web",
    description:
      "Search the public web. Use it for things Kin doesn't have: a company someone joined, an event, a public announcement, a recent news story. Returns titles, URLs, snippets and dates. Cite the source in plain words. Never use it to find someone's address, live location or private details.",
    input_schema: obj({ query: str("A specific search query"), numResults: { type: "number", description: "How many results, 3 to 8. Default 5." } }, ["query"]),
  },
  {
    name: "enrich_person",
    description: "Refresh what Kin knows about one person from their public profiles and the web, adding any new updates to Kin. Use it when the user asks what's new with someone and Kin's information looks old, or when refreshing the feed. Slow; call it for one person at a time.",
    input_schema: obj(who),
  },
  {
    name: "recall_memory",
    description: "What the user told Kin before about one person, and what Kin learned from past gifts and updates. Use it before suggesting something personal.",
    input_schema: obj({ ...who, query: str("What you want to remember, e.g. gift ideas, favourite food") }, ["query"]),
  },
  {
    name: "remember",
    description: "Save something the user told you about one person (a preference, a plan, a date) so Kin remembers it next time.",
    input_schema: obj({ ...who, note: str("What to remember, in one plain sentence") }, ["note"]),
  },
  {
    name: "suggest_gift",
    description:
      "The one gift Kin suggests for a person, with giftId, price, arrival day, the reason and alternatives (each with productId). Returns suggestion null when there is no good idea. Only ever offer gifts this returns.",
    input_schema: obj({ ...who, occasion: str("What the gift is for, e.g. birthday, new job") }),
  },
  {
    name: "send_gift",
    description:
      "Send a suggested gift. It only pays when the user tapped Send gift in the app; otherwise it shows the user a confirm button and nothing is paid. In iMessage it asks the user for a Face ID approval. Call it when the user says to send a gift.",
    input_schema: obj({ giftId: str("giftId from suggest_gift or get_today"), productId: str("productId of an alternative, only if the user picked one") }, ["giftId"]),
  },
  {
    name: "set_rsvp",
    description: "Mark whether the user is going to an event a person posted.",
    input_schema: obj({ updateId: str("updateId of the event"), going: { type: "boolean", description: "true if going" } }, ["updateId", "going"]),
  },
  {
    name: "draft_message",
    description:
      "Draft two short text options the user can copy and send to a person themselves. In the app they appear as cards with Copy and Open Messages. Set dm to true when the user wants a direct message on X, Instagram or LinkedIn instead of a text. Never sends anything.",
    input_schema: obj(
      {
        ...who,
        reason: str("What the message is about, e.g. congrats on the new job at Stripe"),
        dm: { type: "boolean", description: "true for a social DM instead of a text" },
        toolkit: { type: "string", enum: ["twitter", "instagram", "linkedin"], description: "Which network for a DM" },
      },
      ["reason"],
    ),
  },
  {
    name: "mutual_connections",
    description: "People in the user's contacts that this person is connected with on social networks, with how (e.g. follows on Instagram).",
    input_schema: obj(who),
  },
  {
    name: "create_reminder",
    description: "Set a reminder for the user at an exact time, optionally about one person.",
    input_schema: obj(
      {
        title: str("Short reminder text, e.g. Call Maya"),
        at: str("When, as an ISO 8601 date-time with offset, e.g. 2026-11-19T09:00:00-05:00"),
        body: str("Optional detail"),
        name: str("Person's name, if it is about someone"),
        personId: str("personId, if known"),
      },
      ["title", "at"],
    ),
  },
  {
    name: "design_card",
    description: "Redesign the visual card for one update in the Today feed. Use for updates whose card is missing or plain.",
    input_schema: obj({ updateId: str("updateId of the update") }, ["updateId"]),
  },
  {
    name: "share_update",
    description: "Post an update from the user to an audience on Kin. Only when the user clearly asked to share it and said who should see it.",
    input_schema: obj(
      {
        text: str("The update, in the user's words"),
        audience: { type: "string", enum: ["close", "everyone", "city"], description: "close friends, everyone on Kin, or people in the user's city" },
        place: str("City to attach, only if the user asked"),
      },
      ["text", "audience"],
    ),
  },
  {
    name: "get_relationship",
    description:
      "How the user and one person actually talk, from their imported WhatsApp and iMessage chats: closeness (inner circle, close, catching up, dormant), trend (warming or cooling), message count, how often they talk, who usually texts first, typical reply time, when they last talked, and which group chats they share with others. Use it for 'how close am I with', 'when did we last talk', and before suggesting a check-in.",
    input_schema: obj(who),
  },
  {
    name: "who_to_catch_up_with",
    description:
      "People the user is drifting from, based on imported WhatsApp and iMessage chats: close friends whose chats are cooling or who are overdue compared with how often they usually talk. Each has personId, closeness, when they last talked and how often they usually talk. Use it for 'who should I reach out to' and when refreshing the feed.",
    input_schema: obj({ limit: { type: "number", description: "How many people, 1 to 8. Default 5." } }),
  },
];

export function toolLabel(name: string, input: any): string {
  const n = typeof input?.name === "string" && input.name.trim() ? first(input.name.trim()) : null;
  switch (name) {
    case "get_today":
      return "Checking today";
    case "get_person":
      return n ? `Looking up ${n}` : "Looking someone up";
    case "who_is_in":
      return `Checking who's in ${input?.city ?? "that city"}`;
    case "search_people":
      return "Searching your people";
    case "search_web":
      return "Searching the web";
    case "enrich_person":
      return n ? `Reading up on ${n}` : "Reading the web";
    case "recall_memory":
      return "Checking what I remember";
    case "remember":
      return "Saving that";
    case "suggest_gift":
      return n ? `Finding a gift for ${n}` : "Finding a gift";
    case "send_gift":
      return "Preparing the gift";
    case "set_rsvp":
      return "Updating your RSVP";
    case "draft_message":
      return n ? `Drafting a message to ${n}` : "Drafting a message";
    case "mutual_connections":
      return n ? `Finding who ${n} knows` : "Finding mutual friends";
    case "create_reminder":
      return "Setting a reminder";
    case "design_card":
      return "Designing a card";
    case "share_update":
      return "Sharing your update";
    case "get_relationship":
      return n ? `Checking how you and ${n} talk` : "Checking your chats";
    case "who_to_catch_up_with":
      return "Finding who to catch up with";
    default:
      return "Working on it";
  }
}

export const searchPeople = internalQuery({
  args: { userKey: v.string(), query: v.optional(v.string()), city: v.optional(v.string()), interest: v.optional(v.string()) },
  handler: async (ctx, { userKey, query, city, interest }) => {
    const user = await userByKey(ctx, userKey);
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const has = (hay: string, needle?: string) => !needle?.trim() || hay.toLowerCase().includes(needle.trim().toLowerCase());
    return people
      .filter((p) => has(`${p.name} ${p.role}`, query) && has(p.city, city) && has(p.interests.join(" "), interest))
      .slice(0, 10)
      .map((p) => ({ personId: p._id, name: p.name, city: p.city, role: p.role, interests: p.interests }));
  },
});

export const personRef = internalQuery({
  args: { userKey: v.string(), personId: v.string() },
  handler: async (ctx, { userKey, personId }) => {
    const user = await userByKey(ctx, userKey);
    const id = ctx.db.normalizeId("people", personId);
    const p = id ? await ctx.db.get(id) : null;
    return p && p.ownerId === user._id ? { _id: p._id, name: p.name, phone: p.phone ?? null } : null;
  },
});

export async function resolvePerson(ctx: ActionCtx, env: ToolEnv, input: any): Promise<{ _id: Id<"people">; name: string; phone: string | null }> {
  if (typeof input?.personId === "string" && input.personId) {
    const p = await ctx.runQuery(internal.agentTools.personRef, { userKey: env.userKey, personId: input.personId });
    if (p) return p;
  }
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Say which person: pass name or personId.");
  const matches = await ctx.runQuery(internal.keiki.findPerson, { userKey: env.userKey, name });
  if (matches.length === 0) throw new Error(`No one called ${name} in the user's contacts.`);
  if (matches.length > 1) throw new Error(`Several people match ${name}: ${matches.map((m) => m.name).join(", ")}. Ask which one.`);
  const p = await ctx.runQuery(internal.agentTools.personRef, { userKey: env.userKey, personId: matches[0]._id });
  if (!p) throw new Error("Person not found.");
  return p;
}

async function giftFor(ctx: ActionCtx, env: ToolEnv, giftId: unknown) {
  const id = typeof giftId === "string" ? await ctx.runQuery(internal.keiki.normalizeGiftId, { giftId }) : null;
  const gift = id ? await ctx.runQuery(internal.gifts.get, { giftId: id }) : null;
  if (!gift || gift.ownerKey !== env.userKey) throw new Error("No such gift for this user.");
  return gift;
}

type Gift = Awaited<ReturnType<typeof giftFor>>;
const describeGift = (g: Gift) => ({
  giftId: g._id,
  productId: g.product._id,
  status: g.status,
  recipient: g.person.name,
  personId: g.person._id,
  occasion: g.occasion,
  gift: g.product.name,
  price: `$${g.product.price}`,
  arrives: longDay(g.arrives),
  reason: g.reason,
  problem: g.problem,
  alternatives: g.alternatives.map((a) => ({ productId: a.productId, gift: a.name, price: `$${a.price}`, reason: a.reason })),
});

async function sendGiftNow(ctx: ActionCtx, env: ToolEnv, giftId: unknown, productId?: unknown) {
  let gift = await giftFor(ctx, env, giftId);
  if (gift.status === "paid" || gift.status === "ordered") return { status: gift.status, message: `Already sent to ${gift.person.firstName}.` };
  if (typeof productId === "string" && productId && productId !== gift.product._id) {
    const alt = gift.alternatives.find((a) => a.productId === productId);
    if (!alt) throw new Error("That product is not one of this gift's alternatives.");
    await ctx.runMutation(internal.gifts.swapProduct, { giftId: gift._id, productId: alt.productId });
    gift = await giftFor(ctx, env, gift._id);
  }
  if (gift.problem) throw new Error(`Can't send: ${gift.problem}.`);
  const { url, simulated } = await chargeGift(ctx, gift._id, "app");
  if (url) {
    await env.emit(`Checkout for the ${gift.product.name} is ready.`, { type: "open_url", payload: { url, label: "Open checkout", giftId: gift._id } });
    return { status: "payment_open", gift: gift.product.name, recipient: gift.person.name, message: "Checkout is open for the user. The gift is ordered once payment goes through." };
  }
  return { status: simulated ? "ordered" : gift.status, gift: gift.product.name, recipient: gift.person.name, arrives: longDay(gift.arrives) };
}

export async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function turnCredential(agentId: string, turnId: string) {
  const secret = process.env.KEIKI_HARNESS_SECRET;
  if (!secret) throw new Error("KEIKI_HARNESS_SECRET is not set");
  const payload = btoa(JSON.stringify({ a: agentId, t: turnId, ts: Math.floor(Date.now() / 1000) }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `kts1.${payload}.${await hmacHex(secret, `keiki-turn-auth.v1.${payload}`)}`;
}

async function mcpPost(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
  const raw = await res.text();
  const events = raw
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5)));
  const parsed = events.length ? events.find((m) => "result" in m || "error" in m) : raw ? JSON.parse(raw) : null;
  return { res, parsed };
}

async function keikiTool(keiki: KeikiTurnRef, name: string, args: Record<string, unknown>) {
  const headers: Record<string, string> = { Authorization: `Bearer ${await turnCredential(keiki.agentId, keiki.turnId)}` };
  const init = await mcpPost(keiki.mcpUrl, headers, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "kin", version: "1.0.0" } },
  });
  const session = init.res.headers.get("mcp-session-id");
  if (session) headers["Mcp-Session-Id"] = session;
  await fetch(keiki.mcpUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  const call = await mcpPost(keiki.mcpUrl, headers, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
  if (call.parsed?.error) throw new Error(call.parsed.error.message ?? "Keiki tool call failed");
  const content = (call.parsed?.result?.content ?? []) as Array<{ type: string; text?: string }>;
  return { isError: !!call.parsed?.result?.isError, text: content.map((c) => c.text ?? "").join("\n") };
}

type Impl = (ctx: ActionCtx, env: ToolEnv, input: any) => Promise<unknown>;

export const IMPLS: Record<string, Impl> = {
  async get_today(ctx, env) {
    const today = await ctx.runQuery(api.feed.today, { userKey: env.userKey });
    return {
      today: longDay(Date.now()),
      comingUp: today.comingUp.map((item) => ({
        type: item.type,
        person: item.person.name,
        personId: item.person._id,
        city: item.person.city,
        date: longDay(item.at),
        inDays: "days" in item ? item.days : undefined,
        turns: "age" in item ? item.age : undefined,
        gift:
          item.type === "gift"
            ? { giftId: item.gift._id, productId: item.gift.product._id, status: item.gift.status, gift: item.gift.product.name, price: `$${item.gift.product.price}`, arrives: longDay(item.gift.arrives), reason: item.gift.reason }
            : undefined,
        event: item.type === "event" ? { updateId: item.update._id, text: item.update.text, source: item.update.source, place: item.update.place, at: new Date(item.update.eventAt).toISOString(), going: item.going } : undefined,
      })),
      changed: today.updates.slice(0, 10).map((u) => ({
        person: u.person.name,
        personId: u.person._id,
        updateId: u._id,
        kind: u.kind,
        text: u.text,
        source: u.source,
        date: isoDay(u.at),
        until: u.until ? longDay(u.until) : undefined,
        hasCard: u.card?.by === "ai",
      })),
    };
  },

  async get_person(ctx, env, input) {
    const match = await resolvePerson(ctx, env, input);
    const p = await ctx.runQuery(api.people.get, { personId: match._id });
    if (!p) throw new Error("Person not found");
    return {
      personId: p._id,
      name: p.name,
      pronoun: p.pronoun ?? null,
      role: p.role,
      homeCity: p.city,
      cityNow: p.currentCity,
      birthdayInDays: p.birthdayIn,
      interests: p.interests,
      sharesOn: Object.entries(p.handles)
        .filter(([, h]) => !!h)
        .map(([k]) => k),
      close: p.close,
      lastContacted: p.lastContactAt ? isoDay(p.lastContactAt) : null,
      updates: p.updates.slice(0, 10).map((u) => ({
        updateId: u._id,
        kind: u.kind,
        text: u.text,
        source: u.source,
        date: isoDay(u.at),
        until: u.until ? longDay(u.until) : undefined,
        eventAt: u.eventAt ? new Date(u.eventAt).toISOString() : undefined,
        place: u.place,
      })),
      giftsSent: p.sentGifts.map((g) => ({ gift: g.name, occasion: g.occasion, date: isoDay(g.at) })),
    };
  },

  async who_is_in(ctx, env, input) {
    if (typeof input?.city !== "string" || !input.city.trim()) throw new Error("city is required");
    const needle = input.city.trim().toLowerCase();
    const { cities } = await ctx.runQuery(api.cities.counts, { userKey: env.userKey });
    const city = cities.find((c) => c.name.toLowerCase() === needle) ?? cities.find((c) => c.name.toLowerCase().startsWith(needle));
    if (!city) return { city: input.city, people: [] };
    return { city: city.name, country: city.country, people: city.people.map((p) => ({ name: p.name, personId: p._id, why: p.reason })) };
  },

  async search_people(ctx, env, input) {
    const people = await ctx.runQuery(internal.agentTools.searchPeople, {
      userKey: env.userKey,
      query: input?.query || undefined,
      city: input?.city || undefined,
      interest: input?.interest || undefined,
    });
    return { people };
  },

  async search_web(ctx, _env, input) {
    if (typeof input?.query !== "string" || !input.query.trim()) throw new Error("query is required");
    const numResults = Math.min(8, Math.max(3, Number(input.numResults) || 5));
    const { results } = await ctx.runAction(searchWebRef, { query: input.query.trim(), numResults });
    return { results: results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet?.slice(0, 400), publishedAt: r.publishedAt })) };
  },

  async enrich_person(ctx, env, input) {
    const p = await resolvePerson(ctx, env, input);
    return { person: p.name, ...(await ctx.runAction(enrichPersonRef, { personId: p._id })) };
  },

  async recall_memory(ctx, env, input) {
    const p = await resolvePerson(ctx, env, input);
    const memory = await ctx.runAction(internal.memory.recall, { personId: p._id, query: String(input?.query ?? p.name) });
    return { person: p.name, ...memory };
  },

  async remember(ctx, env, input) {
    const p = await resolvePerson(ctx, env, input);
    const note = String(input?.note ?? "").trim();
    if (!note) throw new Error("note is required");
    const now = Date.now();
    const saved = await ctx.runAction(rememberNoteRef, {
      personId: p._id,
      id: `note_${now}`,
      content: `${isoDay(now)}: ${env.userName} told Kin about ${p.name}: ${note}`,
      metadata: { type: "note", date: isoDay(now) },
    });
    return saved ? { saved: true, person: p.name } : { saved: false, reason: "Memory is not configured on this server." };
  },

  async suggest_gift(ctx, env, input) {
    const p = await resolvePerson(ctx, env, input);
    const occasion = typeof input?.occasion === "string" && input.occasion.trim() ? input.occasion.trim() : "birthday";
    const giftId = (await ctx.runQuery(internal.keiki.latestSuggestion, { personId: p._id, now: Date.now() })) ?? (await suggestGift(ctx, p._id, occasion));
    if (!giftId) return { suggestion: null };
    return { suggestion: describeGift(await giftFor(ctx, env, giftId)) };
  },

  async send_gift(ctx, env, input) {
    const gift = await giftFor(ctx, env, input?.giftId);
    if (gift.status === "paid" || gift.status === "ordered") return { status: gift.status, message: `Already sent to ${gift.person.firstName}.` };
    if (env.channel === "imessage") {
      if (!env.keiki) return { status: "needs_approval", message: "Sending needs a Face ID approval in Keiki Vault, which isn't available on this turn. Nothing was paid." };
      const result = await keikiTool(env.keiki, "send_gift", { giftId: gift._id });
      return { status: result.isError ? "not_sent" : "approval_requested", detail: result.text.slice(0, 1500) };
    }
    const tap = env.current?.action;
    const tapped = tap?.type === "send_gift" && tap.payload?.giftId === gift._id && !env.sendGiftUsed;
    if (!tapped) {
      if (gift.problem) throw new Error(`Can't send: ${gift.problem}.`);
      const alt = gift.alternatives.find((a) => a.productId === input?.productId);
      const product = alt ? { _id: alt.productId, name: alt.name, price: alt.price } : gift.product;
      await env.emit(`Send ${gift.person.firstName} the ${product.name}? $${product.price}, arrives ${longDay(gift.arrives)}.`, {
        type: "confirm_send_gift",
        payload: { giftId: gift._id, productId: product._id, personName: gift.person.name, productName: product.name, price: product.price, arrives: gift.arrives },
      });
      return { status: "needs_tap", message: "Nothing was paid. A confirm card with a Send gift button is now showing; the gift is only sent if the user taps it." };
    }
    env.sendGiftUsed = true;
    return sendGiftNow(ctx, env, gift._id, tap?.payload?.productId ?? input?.productId);
  },

  async set_rsvp(ctx, env, input) {
    if (typeof input?.updateId !== "string" || typeof input?.going !== "boolean") throw new Error("updateId and going are required");
    const updateId = await ctx.runQuery(internal.keiki.updateForUser, { userKey: env.userKey, updateId: input.updateId });
    if (!updateId) throw new Error("No such event for this user.");
    await ctx.runMutation(api.rsvps.set, { userKey: env.userKey, updateId, going: input.going });
    const event = await ctx.runQuery(internal.cards.input, { updateId });
    return {
      ok: true,
      going: input.going,
      event: event?.update.text,
      person: event?.person?.firstName,
      at: event?.update.eventAt ? new Date(event.update.eventAt).toISOString() : undefined,
    };
  },

  async draft_message(ctx, env, input) {
    const p = await resolvePerson(ctx, env, input);
    const reason = String(input?.reason ?? "").trim() || "catching up";
    const options = await draftFor(ctx, env.userKey, p._id, reason);
    if (options.length === 0) return { options: [], note: "No draft available right now." };
    let dm: { toolkit: string; url?: string } | undefined;
    if (input?.dm) {
      try {
        const out = await ctx.runAction(draftDmRef, { personId: p._id, text: options[0], toolkit: input.toolkit });
        dm = { toolkit: out.toolkit, url: out.url };
      } catch (e) {
        console.log("agent: social:draftDm unavailable", e instanceof Error ? e.message : e);
      }
    }
    if (env.channel === "app") {
      await env.emit(`Two ways to say it to ${first(p.name)}.`, { type: "draft", payload: { personId: p._id, name: p.name, phone: p.phone, options, dm } });
      return { shown: true, recipient: p.name, options, dm, note: "The options are on screen as cards. Don't repeat them." };
    }
    return { recipient: p.name, options, note: "Give these to the user to copy. Never send them." };
  },

  async mutual_connections(ctx, env, input) {
    const p = await resolvePerson(ctx, env, input);
    return { person: p.name, mutuals: await ctx.runQuery(mutualsRef, { personId: p._id }) };
  },

  async create_reminder(ctx, env, input) {
    const fireAt = Date.parse(String(input?.at ?? ""));
    if (!Number.isFinite(fireAt)) throw new Error("at must be an ISO 8601 date-time");
    const person = input?.personId || input?.name ? await resolvePerson(ctx, env, input) : null;
    await ctx.runMutation(api.reminders.create, { userKey: env.userKey, personId: person?._id, title: String(input?.title ?? ""), body: input?.body, fireAt });
    return { ok: true, at: new Date(fireAt).toISOString(), person: person?.name };
  },

  async design_card(ctx, env, input) {
    const updateId = typeof input?.updateId === "string" ? await ctx.runQuery(internal.keiki.updateForUser, { userKey: env.userKey, updateId: input.updateId }) : null;
    if (!updateId) throw new Error("No such update for this user.");
    await ctx.runAction(internal.cards.generate, { updateId });
    const data = await ctx.runQuery(internal.cards.input, { updateId });
    return { ok: true, card: data?.update.card ? { headline: data.update.card.headline, by: data.update.card.by } : null };
  },

  async get_relationship(ctx, env, input) {
    const p = await resolvePerson(ctx, env, input);
    const r = await ctx.runQuery(relationshipRef, { personId: p._id });
    return r ?? { person: p.name, note: "No WhatsApp or iMessage history imported for this person yet." };
  },

  async who_to_catch_up_with(ctx, env, input) {
    const limit = Math.min(8, Math.max(1, Number(input?.limit) || 5));
    const people = await ctx.runQuery(catchUpRef, { userKey: env.userKey, limit });
    return people.length ? { people } : { people: [], note: "Nobody stands out, or no chats are imported yet." };
  },

  async share_update(ctx, env, input) {
    const text = String(input?.text ?? "").trim();
    const audience = input?.audience;
    if (!text) throw new Error("text is required");
    if (audience !== "close" && audience !== "everyone" && audience !== "city") throw new Error("audience must be close, everyone or city");
    const { reach } = await ctx.runMutation(api.shares.create, { userKey: env.userKey, text, audience, place: typeof input?.place === "string" && input.place ? input.place : undefined });
    return { ok: true, reach };
  },
};
