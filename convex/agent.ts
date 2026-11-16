import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam, Tool, ToolResultBlockParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { httpAction, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import { MODEL } from "./assistant";
import { DAY, nextBirthday, userByKey } from "./lib";
import { safeEqual } from "./payments";
import { KIN_AGENT_PROMPT } from "./prompts";
import { IMPLS, TOOLS, hmacHex, toolLabel, turnCredential, type AgentAction, type Channel, type KeikiTurnRef, type ToolEnv } from "./agentTools";

const MAX_STEPS = 8;
const HISTORY = 40;
const STALE_RUN = 3 * 60 * 1000;
const REFRESH_TOOLS = new Set(["get_today", "get_person", "enrich_person", "design_card", "suggest_gift", "recall_memory", "who_to_catch_up_with"]);
const AUDIENCE: Record<string, string> = { close: "close friends", everyone: "everyone on Kin", city: "people in my city" };

const actionArg = v.object({ type: v.string(), payload: v.any() });
const channelArg = v.union(v.literal("app"), v.literal("imessage"));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const firstName = (name: string) => name.split(" ")[0];
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const stripPeriod = (s: string) => s.trim().replace(/[.!]+$/, "");
const plain = (value: unknown) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

async function threadFor(ctx: MutationCtx, ownerId: Id<"users">) {
  const existing = await ctx.db.query("agentThreads").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).first();
  return existing?._id ?? (await ctx.db.insert("agentThreads", { ownerId, at: Date.now(), status: "idle" }));
}

async function describeAction(ctx: MutationCtx, ownerId: Id<"users">, action: AgentAction): Promise<string> {
  const p = action.payload ?? {};
  const person = async (id: unknown) => {
    const pid = typeof id === "string" ? ctx.db.normalizeId("people", id) : null;
    const doc = pid ? await ctx.db.get(pid) : null;
    return doc && doc.ownerId === ownerId ? doc : null;
  };
  switch (action.type) {
    case "send_gift": {
      const id = typeof p.giftId === "string" ? ctx.db.normalizeId("gifts", p.giftId) : null;
      const gift = id ? await ctx.db.get(id) : null;
      if (!gift || gift.ownerId !== ownerId) return "Send the gift.";
      const productId = typeof p.productId === "string" ? ctx.db.normalizeId("products", p.productId) : null;
      const [who, product] = await Promise.all([ctx.db.get(gift.personId), ctx.db.get(productId ?? gift.productId)]);
      return `Send ${who ? firstName(who.name) : "them"} the ${product?.name ?? "gift"}.`;
    }
    case "set_rsvp": {
      const id = typeof p.updateId === "string" ? ctx.db.normalizeId("updates", p.updateId) : null;
      const update = id ? await ctx.db.get(id) : null;
      const who = update && update.ownerId === ownerId ? await ctx.db.get(update.personId) : null;
      const what = update && who ? `${firstName(who.name)}'s event, “${stripPeriod(update.text)}”` : "the event";
      return p.going ? `I'm going to ${what}.` : `I'm not going to ${what}.`;
    }
    case "draft_message": {
      const who = await person(p.personId);
      const name = who ? firstName(who.name) : "them";
      const reason = typeof p.reason === "string" ? p.reason.trim() : "";
      if (reason === "birthday") return `Draft a birthday message for ${name}.`;
      return reason ? `Draft a message to ${name} about ${reason}.` : `Draft a message to ${name}.`;
    }
    case "share_update":
      return `Share “${clip(String(p.text ?? "").trim(), 140)}” with ${AUDIENCE[p.audience] ?? "my people"}${p.place ? `, tagged ${p.place}` : ""}.`;
    default:
      return `Do this: ${action.type.replace(/_/g, " ")}.`;
  }
}

async function kick(ctx: MutationCtx, threadId: Id<"agentThreads">) {
  const thread = await ctx.db.get(threadId);
  if (!thread) return;
  const now = Date.now();
  if (thread.status === "running" && (thread.runAt ?? 0) > now - STALE_RUN) return;
  await ctx.db.patch(threadId, { status: "running", runAt: now });
  await ctx.scheduler.runAfter(0, internal.agent.run, { threadId });
}

export const instruct = mutation({
  args: { userKey: v.optional(v.string()), text: v.optional(v.string()), action: v.optional(actionArg) },
  handler: async (ctx, { userKey, text, action }): Promise<{ threadId: Id<"agentThreads">; messageId: Id<"agentMessages"> }> => {
    const user = await userByKey(ctx, userKey);
    const typed = text?.trim();
    if (!typed && !action) throw new Error("Type something or tap an action.");
    const threadId = await threadFor(ctx, user._id);
    const messageId = await ctx.db.insert("agentMessages", {
      threadId,
      ownerId: user._id,
      role: "user",
      text: typed || (await describeAction(ctx, user._id, action!)),
      action,
      channel: "app",
      at: Date.now(),
    });
    await kick(ctx, threadId);
    return { threadId, messageId };
  },
});

const view = (m: Doc<"agentMessages">) => ({
  _id: m._id,
  role: m.role,
  text: m.text,
  action: m.action ?? null,
  toolName: m.toolName ?? null,
  status: m.status ?? null,
  channel: m.channel ?? "app",
  at: m.at,
});

export const thread = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const t = await ctx.db.query("agentThreads").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).first();
    if (!t) return [];
    const rows = await ctx.db.query("agentMessages").withIndex("by_thread_at", (q) => q.eq("threadId", t._id)).order("desc").take(80);
    return rows.reverse().map(view);
  },
});

export const followUp = query({
  args: { userKey: v.optional(v.string()), messageId: v.id("agentMessages") },
  handler: async (ctx, { userKey, messageId }) => {
    const user = await userByKey(ctx, userKey);
    const m = await ctx.db.get(messageId);
    if (!m || m.ownerId !== user._id) return null;
    const t = await ctx.db.get(m.threadId);
    const after = await ctx.db.query("agentMessages").withIndex("by_thread_at", (q) => q.eq("threadId", m.threadId).gt("at", m.at)).take(40);
    const replies = after.filter((r) => r.role === "assistant");
    return {
      actions: replies.flatMap((r) => (r.action ? [r.action] : [])),
      error: replies.find((r) => r.status === "error")?.text ?? after.find((r) => r.role === "tool" && r.status === "error")?.text ?? null,
      done: t?.status !== "running" || replies.some((r) => !r.action),
    };
  },
});

type Row = Pick<Doc<"agentMessages">, "role" | "text" | "action" | "toolName" | "toolInput" | "toolResult" | "toolUseId" | "status">;
type State = { user: { key: string; name: string; city: string; tz: string | null }; rows: Row[]; current: { text: string; action?: AgentAction } | null };

export const state = internalQuery({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }): Promise<State | null> => {
    const t = await ctx.db.get(threadId);
    const user = t ? await ctx.db.get(t.ownerId) : null;
    if (!t || !user) return null;
    const rows = (await ctx.db.query("agentMessages").withIndex("by_thread_at", (q) => q.eq("threadId", threadId)).order("desc").take(HISTORY)).reverse();
    const last = rows[rows.length - 1];
    return {
      user: { key: user.key, name: user.name, city: user.city, tz: user.tz ?? null },
      rows: rows.map((r) => ({ role: r.role, text: r.text, action: r.action, toolName: r.toolName, toolInput: r.toolInput, toolResult: r.toolResult, toolUseId: r.toolUseId, status: r.status })),
      current: last?.role === "user" ? { text: last.text, action: last.action } : null,
    };
  },
});

export const write = internalMutation({
  args: {
    threadId: v.id("agentThreads"),
    role: v.union(v.literal("assistant"), v.literal("tool"), v.literal("event")),
    text: v.string(),
    action: v.optional(actionArg),
    toolName: v.optional(v.string()),
    toolInput: v.optional(v.any()),
    toolUseId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("running"), v.literal("done"), v.literal("error"))),
    channel: v.optional(channelArg),
  },
  handler: async (ctx, args): Promise<Id<"agentMessages">> => {
    const t = await ctx.db.get(args.threadId);
    if (!t) throw new Error("No such thread");
    return await ctx.db.insert("agentMessages", { ...args, ownerId: t.ownerId, at: Date.now() });
  },
});

export const finishTool = internalMutation({
  args: { messageId: v.id("agentMessages"), status: v.union(v.literal("done"), v.literal("error")), toolResult: v.string() },
  handler: async (ctx, { messageId, status, toolResult }) => {
    await ctx.db.patch(messageId, { status, toolResult });
  },
});

export const settle = internalMutation({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    const last = await ctx.db.query("agentMessages").withIndex("by_thread_at", (q) => q.eq("threadId", threadId)).order("desc").first();
    if (last?.role === "user") {
      await ctx.db.patch(threadId, { status: "running", runAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.agent.run, { threadId });
      return;
    }
    await ctx.db.patch(threadId, { status: "idle" });
  },
});

export const inbound = internalMutation({
  args: { userKey: v.string(), texts: v.array(v.string()) },
  handler: async (ctx, { userKey, texts }) => {
    const user = await userByKey(ctx, userKey);
    const threadId = await threadFor(ctx, user._id);
    for (const text of texts) await ctx.db.insert("agentMessages", { threadId, ownerId: user._id, role: "user", text, channel: "imessage", at: Date.now() });
    return threadId;
  },
});

async function call(ctx: ActionCtx, env: ToolEnv, threadId: Id<"agentThreads"> | null, name: string, input: unknown, toolUseId?: string) {
  const id = toolUseId ?? `kin_${crypto.randomUUID().replace(/-/g, "")}`;
  const messageId = threadId
    ? await ctx.runMutation(internal.agent.write, { threadId, role: "tool", text: toolLabel(name, input), toolName: name, toolInput: plain(input ?? {}), toolUseId: id, status: "running", channel: env.channel })
    : null;
  let ok = true;
  let result: unknown;
  try {
    const impl = IMPLS[name];
    if (!impl) throw new Error(`Unknown tool ${name}`);
    result = await impl(ctx, env, input ?? {});
  } catch (e) {
    ok = false;
    result = { error: e instanceof Error ? e.message : String(e) };
  }
  const text = clip(JSON.stringify(result ?? null), 12000);
  if (messageId) await ctx.runMutation(internal.agent.finishTool, { messageId, status: ok ? "done" : "error", toolResult: text });
  return { ok, result: result as any, id, text };
}

function systemPrompt(user: State["user"], channel: Channel) {
  const tz = user.tz ?? "America/New_York";
  const now = new Date().toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" });
  const where =
    channel === "imessage"
      ? "You are talking over iMessage. Plain text only; cards and buttons don't show here."
      : "You are talking in the Kin app's chat. Cards and buttons you trigger (confirm, drafts, checkout) show under your reply.";
  return `${KIN_AGENT_PROMPT}

Right now
- It is ${now}.
- The user is ${user.name}, who lives in ${user.city}.
- ${where}`;
}

function history(rows: Row[], extra?: string): MessageParam[] {
  const out: MessageParam[] = [];
  const add = (role: "user" | "assistant", block: ContentBlockParam) => {
    const last = out[out.length - 1];
    if (last?.role === role) (last.content as ContentBlockParam[]).push(block);
    else out.push({ role, content: [block] });
  };
  for (const r of rows) {
    if (r.role === "user") add("user", { type: "text", text: r.action ? `[Tapped in the app] ${r.text}` : r.text });
    else if (r.role === "tool") {
      if (!r.toolUseId || !r.toolName || r.status === "running") continue;
      add("assistant", { type: "tool_use", id: r.toolUseId, name: r.toolName, input: r.toolInput ?? {} });
      add("user", { type: "tool_result", tool_use_id: r.toolUseId, content: typeof r.toolResult === "string" ? r.toolResult : JSON.stringify(r.toolResult ?? null), is_error: r.status === "error" });
    } else {
      const text = r.role === "event" ? `[Daily brief Kin wrote earlier from the feed] ${r.text}` : r.action ? `${r.text} [shown to the user as a ${r.action.type.replace(/_/g, " ")} card]` : r.text;
      if (text.trim()) add("assistant", { type: "text", text });
    }
  }
  if (extra) add("user", { type: "text", text: extra });
  while (out.length) {
    const head = out[0];
    if (head.role === "user") {
      const blocks = (head.content as ContentBlockParam[]).filter((b) => b.type !== "tool_result");
      if (blocks.length) {
        head.content = blocks;
        break;
      }
    }
    out.shift();
  }
  return out;
}

async function loop(ctx: ActionCtx, env: ToolEnv, threadId: Id<"agentThreads"> | null, system: string, messages: MessageParam[], tools: Tool[] = TOOLS) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "I can't answer right now: the assistant isn't configured on the server.";
  const client = new Anthropic({ apiKey });
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 2048, system, tools, messages });
    const text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    const uses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || uses.length === 0) return text;
    if (text && threadId) await ctx.runMutation(internal.agent.write, { threadId, role: "assistant", text, channel: env.channel });
    messages.push({ role: "assistant", content: res.content });
    const results: ToolResultBlockParam[] = [];
    for (const use of uses) {
      const r = await call(ctx, env, threadId, use.name, use.input, use.id);
      results.push({ type: "tool_result", tool_use_id: use.id, content: r.text, is_error: !r.ok });
    }
    messages.push({ role: "user", content: results });
  }
  return "That took more steps than I expected. Could you ask me again a simpler way?";
}

type Tap = (ctx: ActionCtx, env: ToolEnv, threadId: Id<"agentThreads">, payload: any, tz: string) => Promise<string | null>;

const TAPS: Record<string, Tap> = {
  async send_gift(ctx, env, threadId, payload) {
    const r = await call(ctx, env, threadId, "send_gift", { giftId: payload.giftId, productId: payload.productId });
    if (!r.ok) return `I couldn't send it. ${r.result.error}`;
    if (r.result.status === "payment_open") return "Checkout is open. The gift is ordered as soon as payment goes through.";
    if (r.result.message) return r.result.message;
    return `Done. ${firstName(r.result.recipient)} gets the ${r.result.gift}, arriving ${r.result.arrives}.`;
  },
  async set_rsvp(ctx, env, threadId, payload, tz) {
    const r = await call(ctx, env, threadId, "set_rsvp", { updateId: payload.updateId, going: !!payload.going });
    if (!r.ok) return `I couldn't update that. ${r.result.error}`;
    if (!r.result.going) return "Got it, you're not going.";
    const when = r.result.at ? new Date(r.result.at).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: tz }) : null;
    return when ? `You're going. It's ${when}.` : "You're going.";
  },
  async draft_message(ctx, env, threadId, payload) {
    const reason = typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim() : "catching up";
    const r = await call(ctx, env, threadId, "draft_message", { personId: payload.personId, reason: reason === "birthday" ? "their birthday is coming up" : reason });
    if (!r.ok) return `I couldn't draft that. ${r.result.error}`;
    return r.result.options?.length ? null : "I couldn't come up with a good draft right now. Try again in a moment.";
  },
  async share_update(ctx, env, threadId, payload) {
    const r = await call(ctx, env, threadId, "share_update", { text: payload.text, audience: payload.audience, place: payload.place });
    if (!r.ok) return `I couldn't share that. ${r.result.error}`;
    return `Shared with ${r.result.reach} people.`;
  },
};

async function respond(ctx: ActionCtx, threadId: Id<"agentThreads">, s: State, channel: Channel, opts: { keiki?: KeikiTurnRef; extra?: string } = {}) {
  const env: ToolEnv = {
    userKey: s.user.key,
    userName: s.user.name,
    channel,
    current: s.current,
    sendGiftUsed: false,
    keiki: opts.keiki,
    emit: async (text, action) => {
      await ctx.runMutation(internal.agent.write, { threadId, role: "assistant", text, action: plain(action), channel });
    },
  };
  const tap = s.current?.action;
  const handler = tap && channel === "app" ? TAPS[tap.type] : undefined;
  const reply = handler ? await handler(ctx, env, threadId, tap!.payload ?? {}, s.user.tz ?? "America/New_York") : await loop(ctx, env, threadId, systemPrompt(s.user, channel), history(s.rows, opts.extra));
  if (reply) await ctx.runMutation(internal.agent.write, { threadId, role: "assistant", text: reply, channel });
  return reply;
}

export const run = internalAction({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    try {
      const s = await ctx.runQuery(internal.agent.state, { threadId });
      if (s?.current) await respond(ctx, threadId, s, "app");
    } catch (e) {
      console.log("agent.run failed:", e instanceof Error ? e.message : e);
      await ctx.runMutation(internal.agent.write, { threadId, role: "assistant", text: "Something went wrong on my side. Try again in a moment.", status: "error", channel: "app" });
    } finally {
      await ctx.runMutation(internal.agent.settle, { threadId });
    }
  },
});

export const feedWork = internalQuery({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, { userId, now }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const t = await ctx.db.query("agentThreads").withIndex("by_owner", (q) => q.eq("ownerId", userId)).first();
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    const names = new Map(people.map((p) => [p._id, p.name]));
    const gifts = await ctx.db.query("gifts").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    const soon = people.flatMap((p) => {
      const b = nextBirthday(p.birthday, now);
      return b && b.days <= 7 ? [{ personId: p._id, name: p.name, inDays: b.days, hasGift: gifts.some((g) => g.personId === p._id && g.status !== "dismissed" && g.at > now - 30 * DAY) }] : [];
    });
    const recent = await ctx.db.query("updates").withIndex("by_owner_at", (q) => q.eq("ownerId", userId).gte("at", now - 3 * DAY)).order("desc").take(40);
    const plainCards = recent
      .filter((u) => u.at <= now && u.card?.by !== "ai")
      .slice(0, 5)
      .map((u) => ({ updateId: u._id, person: names.get(u.personId) ?? null, text: u.text }));
    const birthdays = soon.filter((b) => b.inDays <= 3);
    return {
      userKey: user.key,
      lastSignature: t?.feedSignature ?? null,
      signature: JSON.stringify([new Date(now).toISOString().slice(0, 10), recent[0]?._id ?? null, recent.length, birthdays.map((b) => `${b.personId}:${b.hasGift}`), plainCards.length]),
      birthdays,
      plainCards,
      refresh: soon.slice(0, 3).map((b) => ({ personId: b.personId, name: b.name })),
    };
  },
});

export const ensureThread = internalMutation({
  args: { userId: v.id("users"), feedSignature: v.string() },
  handler: async (ctx, { userId, feedSignature }) => {
    const threadId = await threadFor(ctx, userId);
    await ctx.db.patch(threadId, { feedSignature });
    return threadId;
  },
});

export const refreshFeed = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ skipped: boolean; brief?: string }> => {
    const work = await ctx.runQuery(internal.agent.feedWork, { userId, now: Date.now() });
    if (!work || work.signature === work.lastSignature) return { skipped: true };
    const threadId = await ctx.runMutation(internal.agent.ensureThread, { userId, feedSignature: work.signature });
    const s = await ctx.runQuery(internal.agent.state, { threadId });
    if (!s) return { skipped: true };
    const env: ToolEnv = { userKey: s.user.key, userName: s.user.name, channel: "app", current: null, sendGiftUsed: false, emit: async () => {} };
    const instruction = [
      "Refresh today's feed. Work list:",
      JSON.stringify({ birthdaysInNext3Days: work.birthdays, updatesWithPlainCards: work.plainCards, peopleToRefresh: work.refresh }),
      "- For each birthday with hasGift false, call suggest_gift.",
      "- For each update with a plain card, call design_card.",
      "- Call enrich_person for at most two people from peopleToRefresh.",
      "- Call who_to_catch_up_with once; if a close friend is drifting, name one in the brief with when you last talked.",
      "Then reply with the one-line brief, or exactly: nothing new",
    ].join("\n");
    const brief = await loop(ctx, env, null, systemPrompt(s.user, "app"), [{ role: "user", content: instruction }], TOOLS.filter((t) => REFRESH_TOOLS.has(t.name)));
    if (brief && !/^nothing new\.?$/i.test(brief)) await ctx.runMutation(internal.agent.write, { threadId, role: "event", text: brief, channel: "app" });
    return { skipped: false, brief };
  },
});

export const refreshAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const [i, user] of users.entries()) await ctx.scheduler.runAfter(i * 20_000, internal.agent.refreshFeed, { userId: user._id });
  },
});

async function verifyHarness(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3).toLowerCase());
  if (!t || !/^\d+$/.test(t) || Math.abs(Date.now() / 1000 - Number(t)) > 300 || signatures.length === 0) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return signatures.some((s) => safeEqual(s, expected));
}

export const keikiTurn = httpAction(async (ctx, request) => {
  const secret = process.env.KEIKI_HARNESS_SECRET;
  if (!secret) return json({ error: "signing_secret_missing" }, 503);
  const raw = await request.text();
  if (!(await verifyHarness(raw, request.headers.get("Keiki-Signature"), secret))) return json({ error: "invalid_signature" }, 401);
  let turn: any;
  try {
    turn = JSON.parse(raw);
  } catch {
    return json({ error: "malformed_payload" }, 400);
  }
  if (turn?.type !== "keiki.turn") return json({ ok: true }, 202);
  if (typeof turn.turnId !== "string" || typeof turn.agentId !== "string" || typeof turn.keiki?.turnUrl !== "string") return json({ error: "malformed_payload" }, 400);
  await ctx.scheduler.runAfter(0, internal.agent.imessageTurn, {
    turnId: turn.turnId,
    agentId: turn.agentId,
    conversationId: String(turn.conversationId ?? ""),
    turnUrl: turn.keiki.turnUrl,
    mcpUrl: String(turn.keiki.mcpUrl ?? ""),
    silent: !!turn.silent,
    messages: (Array.isArray(turn.messages) ? turn.messages : []).map((m: any) => ({ text: String(m?.content ?? m?.text ?? ""), silent: !!m?.silent })),
  });
  return json({ accepted: true }, 202);
});

async function turnApi(keiki: KeikiTurnRef, path: string, body: unknown) {
  const res = await fetch(`${keiki.turnUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await turnCredential(keiki.agentId, keiki.turnId)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.log(`keiki turn ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.ok;
}

export const imessageTurn = internalAction({
  args: {
    turnId: v.string(),
    agentId: v.string(),
    conversationId: v.string(),
    turnUrl: v.string(),
    mcpUrl: v.string(),
    silent: v.boolean(),
    messages: v.array(v.object({ text: v.string(), silent: v.boolean() })),
  },
  handler: async (ctx, a) => {
    const keiki: KeikiTurnRef = { turnUrl: a.turnUrl, mcpUrl: a.mcpUrl, agentId: a.agentId, turnId: a.turnId };
    const send = (text: string) => turnApi(keiki, "/messages", { text, idempotencyKey: `kin-${a.turnId}` });
    try {
      const caller = a.conversationId ? await ctx.runMutation(internal.keiki.resolveCaller, { phone: a.conversationId }) : null;
      if (!caller) {
        if (!a.silent) await send("This number isn't connected to Kin yet. Add it in the Kin app, then text again.");
        await turnApi(keiki, "/complete", { status: "completed" });
        return;
      }
      const texts = a.messages.filter((m) => !m.silent && m.text.trim()).map((m) => m.text.trim());
      const notices = a.messages.filter((m) => m.silent && m.text.trim()).map((m) => m.text.trim());
      const threadId = await ctx.runMutation(internal.agent.inbound, { userKey: caller.key, texts });
      const s = await ctx.runQuery(internal.agent.state, { threadId });
      const extra = notices.length ? `[Notice from Kin's server, not written by the user] ${notices.join(" ")}` : undefined;
      if (s && (s.current || extra)) {
        const reply = await respond(ctx, threadId, s, "imessage", { keiki, extra });
        if (reply && !/^nothing new\.?$/i.test(reply)) await send(reply);
      }
      await turnApi(keiki, "/complete", { status: "completed" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log("agent.imessageTurn failed:", error);
      await turnApi(keiki, "/complete", { status: "failed", error: clip(error, 300) });
    }
  },
});
