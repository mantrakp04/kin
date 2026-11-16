import { action, httpAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { nextBirthday, userByKey } from "./lib";
import { draftFor, isoDay } from "./assistant";
import { suggestGift } from "./gifts";
import { chargeGift, safeEqual } from "./payments";

const KEIKI_BASE = () => process.env.KEIKI_BASE_URL ?? "https://onkeiki.com";
const SCOPE = "kin:user";

type NoticeTarget = { user: { phone: string; keikiOptIn: boolean }; gift: Id<"gifts"> | null; birthday?: { at: number; days: number } | null };
type Caller = { key: string; name: string; keikiOptIn: boolean };
type ToolContext = { phone?: string; agentId?: string; preflight?: boolean; approval?: { actionId: string; decidedVia: string; decidedBy?: unknown } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const digits = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const longDay = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

async function verifyKeiki(raw: string, headers: Headers): Promise<"ok" | "unconfigured" | "invalid"> {
  const secret = process.env.KEIKI_SIGNING_SECRET;
  if (!secret) return "unconfigured";
  const timestamp = headers.get("x-keiki-timestamp");
  const signature = headers.get("x-keiki-signature");
  if (!timestamp || !signature?.startsWith("sha256=")) return "invalid";
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return "invalid";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(signature.slice("sha256=".length).toLowerCase(), expected) ? "ok" : "invalid";
}

export const resolveCaller = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }): Promise<Caller | null> => {
    let user = await ctx.db.query("users").withIndex("by_phone", (q) => q.eq("phone", phone)).first();
    if (!user && digits(phone).length >= 7) user = (await ctx.db.query("users").collect()).find((u) => digits(u.phone) === digits(phone)) ?? null;
    if (!user) return null;
    if (!user.keikiOptIn) {
      await ctx.db.patch(user._id, { keikiOptIn: true });
      console.log(`keiki: ${user.key} opted in by texting Kin`);
    }
    return { key: user.key, name: user.name, keikiOptIn: true };
  },
});

export const setOptIn = internalMutation({
  args: { userKey: v.string(), optIn: v.boolean() },
  handler: async (ctx, { userKey, optIn }) => {
    const user = await userByKey(ctx, userKey);
    await ctx.db.patch(user._id, { keikiOptIn: optIn });
  },
});

function tool(handler: (ctx: ActionCtx, caller: Caller, input: any, context: ToolContext) => Promise<Response | object>) {
  return httpAction(async (ctx, request) => {
    const raw = await request.text();
    const verified = await verifyKeiki(raw, request.headers);
    if (verified === "unconfigured") return json({ error: "Kin in Messages is not configured on this server." }, 503);
    if (verified === "invalid") return json({ error: "invalid signature" }, 401);
    let body: { input?: unknown; context?: ToolContext };
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const context = body.context ?? {};
    const caller = context.phone ? await ctx.runMutation(internal.keiki.resolveCaller, { phone: context.phone }) : null;
    if (!caller || !caller.keikiOptIn) return json({ error: "This number is not connected to a Kin account, so I can't look anything up." }, 403);
    try {
      const result = await handler(ctx, caller, body.input ?? {}, context);
      return result instanceof Response ? result : json(result);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });
}

export const findPerson = internalQuery({
  args: { userKey: v.string(), name: v.string() },
  handler: async (ctx, { userKey, name }): Promise<Array<{ _id: Id<"people">; name: string }>> => {
    const user = await userByKey(ctx, userKey);
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const needle = name.trim().toLowerCase();
    const exact = people.filter((p) => p.name.toLowerCase() === needle);
    const matches = exact.length ? exact : people.filter((p) => p.name.toLowerCase().split(" ").some((part) => part === needle) || p.name.toLowerCase().startsWith(needle));
    return matches.slice(0, 5).map((p) => ({ _id: p._id, name: p.name }));
  },
});

async function onePerson(ctx: ActionCtx, caller: Caller, name: unknown): Promise<{ _id: Id<"people">; name: string }> {
  if (typeof name !== "string" || !name.trim()) throw new Error("name is required");
  const matches = await ctx.runQuery(internal.keiki.findPerson, { userKey: caller.key, name });
  if (matches.length === 0) throw new Error(`No one called ${name} in this user's contacts.`);
  if (matches.length > 1) throw new Error(`Several people match ${name}: ${matches.map((m) => m.name).join(", ")}. Ask which one.`);
  return matches[0];
}

type GiftView = NonNullable<Awaited<ReturnType<typeof giftView>>>;
async function giftView(ctx: ActionCtx, caller: Caller, giftId: unknown) {
  const id = typeof giftId === "string" ? await ctx.runQuery(internal.keiki.normalizeGiftId, { giftId }) : null;
  const gift = id ? await ctx.runQuery(internal.gifts.get, { giftId: id }) : null;
  if (!gift || gift.ownerKey !== caller.key) return null;
  return gift;
}

export const normalizeGiftId = internalQuery({
  args: { giftId: v.string() },
  handler: async (ctx, { giftId }): Promise<Id<"gifts"> | null> => ctx.db.normalizeId("gifts", giftId),
});

const describeGift = (g: GiftView) => ({
  giftId: g._id,
  status: g.status,
  recipient: g.person.name,
  occasion: g.occasion,
  gift: g.product.name,
  price: `$${g.product.price}`,
  arrives: longDay(g.arrives),
  reason: g.reason,
  alternatives: g.alternatives.map((a) => ({ productId: a.productId, gift: a.name, price: `$${a.price}`, arrives: longDay(Date.parse(a.arrives)), reason: a.reason })),
});

export const latestSuggestion = internalQuery({
  args: { personId: v.id("people"), now: v.number() },
  handler: async (ctx, { personId, now }): Promise<Id<"gifts"> | null> => {
    const gifts = await ctx.db.query("gifts").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
    return gifts.filter((g) => g.status === "suggested" && g.arriveBy >= now).sort((a, b) => b.at - a.at)[0]?._id ?? null;
  },
});

export const updateForUser = internalQuery({
  args: { userKey: v.string(), updateId: v.string() },
  handler: async (ctx, { userKey, updateId }): Promise<Id<"updates"> | null> => {
    const user = await userByKey(ctx, userKey);
    const id = ctx.db.normalizeId("updates", updateId);
    const update = id ? await ctx.db.get(id) : null;
    return update && update.ownerId === user._id ? update._id : null;
  },
});

export const getToday = tool(async (ctx, caller) => {
  const today = await ctx.runQuery(api.feed.today, { userKey: caller.key });
  return {
    today: longDay(Date.now()),
    comingUp: today.comingUp.map((item) => ({
      type: item.type,
      person: item.person.name,
      city: item.person.city,
      date: longDay(item.at),
      inDays: "days" in item ? item.days : undefined,
      turns: "age" in item ? item.age : undefined,
      gift: item.type === "gift" ? { giftId: item.gift._id, status: item.gift.status, gift: item.gift.product.name, price: `$${item.gift.product.price}`, arrives: longDay(item.gift.arrives), reason: item.gift.reason } : undefined,
      event: item.type === "event" ? { updateId: item.update._id, text: item.update.text, source: item.update.source, place: item.update.place, at: new Date(item.update.eventAt).toISOString(), going: item.going } : undefined,
    })),
    changed: today.updates.slice(0, 8).map((u) => ({ person: u.person.name, kind: u.kind, text: u.text, source: u.source, date: isoDay(u.at), until: u.until ? longDay(u.until) : undefined })),
  };
});

export const getPerson = tool(async (ctx, caller, input) => {
  const match = await onePerson(ctx, caller, input.name);
  const p = await ctx.runQuery(api.people.get, { personId: match._id });
  if (!p) throw new Error("Person not found");
  return {
    name: p.name,
    pronoun: p.pronoun ?? null,
    role: p.role,
    city: p.currentCity,
    birthdayInDays: p.birthdayIn,
    lastContacted: p.lastContactAt ? isoDay(p.lastContactAt) : null,
    updates: p.updates.slice(0, 8).map((u) => ({
      updateId: u._id,
      kind: u.kind,
      text: u.text,
      source: u.source,
      date: isoDay(u.at),
      until: u.until ? longDay(u.until) : undefined,
      eventAt: u.eventAt ? new Date(u.eventAt).toISOString() : undefined,
    })),
    giftsSent: p.sentGifts.map((g) => ({ gift: g.name, occasion: g.occasion, date: isoDay(g.at) })),
  };
});

export const whoIsIn = tool(async (ctx, caller, input) => {
  if (typeof input.city !== "string" || !input.city.trim()) throw new Error("city is required");
  const needle = input.city.trim().toLowerCase();
  const { cities } = await ctx.runQuery(api.cities.counts, { userKey: caller.key });
  const city = cities.find((c) => c.name.toLowerCase() === needle) ?? cities.find((c) => c.name.toLowerCase().startsWith(needle));
  if (!city) return { city: input.city, people: [] };
  return { city: city.name, people: city.people.map((p) => ({ name: p.name, why: p.reason })) };
});

export const suggestGiftTool = tool(async (ctx, caller, input) => {
  const person = await onePerson(ctx, caller, input.name);
  const occasion = typeof input.occasion === "string" && input.occasion.trim() ? input.occasion.trim() : "birthday";
  const giftId = (await ctx.runQuery(internal.keiki.latestSuggestion, { personId: person._id, now: Date.now() })) ?? (await suggestGift(ctx, person._id, occasion));
  const gift = giftId ? await giftView(ctx, caller, giftId) : null;
  return gift ? { suggestion: describeGift(gift) } : { suggestion: null };
});

function approvalCard(g: GiftView) {
  return {
    v: 1,
    blocks: [
      { kind: "header", title: "Send a gift", subtitle: `For ${g.person.name}'s ${g.occasion}` },
      {
        kind: "fields",
        fields: [
          { label: "Recipient", value: g.person.name },
          { label: "Gift", value: g.product.name },
          { label: "Price", value: `$${g.product.price}` },
          { label: "Arrives", value: longDay(g.arrives) },
        ],
      },
    ],
    theme: { approveLabel: "Send gift", declineLabel: "Not now" },
  };
}

export const previewSendGift = tool(async (ctx, caller, input) => {
  const gift = await giftView(ctx, caller, input.giftId);
  if (!gift) return json({ error: "No such gift for this user." }, 404);
  return { ...describeGift(gift), problem: gift.problem, card: approvalCard(gift) };
});

export const sendGift = tool(async (ctx, caller, input, context) => {
  const gift = await giftView(ctx, caller, input.giftId);
  if (!gift) return json({ error: "No such gift for this user." }, 404);
  if (gift.problem) return json({ error: `Can't send: ${gift.problem}.` }, 409);
  if (context.preflight) return { ok: true, ...describeGift(gift) };
  if (!context.approval) return json({ error: "send_gift needs a Face ID approval in Keiki Vault." }, 403);

  const { url } = await chargeGift(ctx, gift._id, "imessage");
  if (url) return { status: "payment_required", url, message: "Payment is open in Whop. The gift is ordered once payment goes through." };
  for (let i = 0; i < 12; i++) {
    const now = await giftView(ctx, caller, gift._id);
    if (now?.status === "ordered") return { ...describeGift(now), status: "ordered" };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { status: "processing", message: "Paid. The order is still being placed." };
});

export const setRsvp = tool(async (ctx, caller, input) => {
  if (typeof input.updateId !== "string" || typeof input.going !== "boolean") throw new Error("updateId and going are required");
  const updateId = await ctx.runQuery(internal.keiki.updateForUser, { userKey: caller.key, updateId: input.updateId });
  if (!updateId) return json({ error: "No such event for this user." }, 404);
  await ctx.runMutation(api.rsvps.set, { userKey: caller.key, updateId, going: input.going });
  return { ok: true, going: input.going };
});

export const draftMessageTool = tool(async (ctx, caller, input) => {
  const person = await onePerson(ctx, caller, input.name);
  if (typeof input.reason !== "string" || !input.reason.trim()) throw new Error("reason is required");
  const options = await draftFor(ctx, caller.key, person._id, input.reason);
  return { recipient: person.name, options, note: options.length ? "Give these to the user to copy. Never send them." : "No draft available right now." };
});

export const identity = httpAction(async (ctx, request) => {
  const raw = await request.text();
  const verified = await verifyKeiki(raw, request.headers);
  if (verified === "unconfigured") return json({ error: "not configured" }, 503);
  if (verified === "invalid") return json({ error: "invalid signature" }, 401);
  const body = JSON.parse(raw) as { sender?: { channel?: string; userId?: string; phone?: string } };
  const phone = body.sender?.userId ?? body.sender?.phone;
  const caller = phone ? await ctx.runMutation(internal.keiki.resolveCaller, { phone }) : null;
  if (!caller) {
    return json({ userId: null, scopes: [], ttlSeconds: 0, reply: "This number isn't connected to Kin yet. Add it in the Kin app, then text again." });
  }
  return json({ userId: caller.key, role: "owner", scopes: [SCOPE], ttlSeconds: 900 });
});

export const noticeTarget = internalQuery({
  args: { userKey: v.optional(v.string()), giftId: v.optional(v.id("gifts")), now: v.number() },
  handler: async (ctx, { userKey, giftId, now }): Promise<NoticeTarget> => {
    const user = await userByKey(ctx, userKey);
    let gift: Doc<"gifts"> | null = giftId ? await ctx.db.get(giftId) : null;
    if (!gift) {
      const gifts = await ctx.db.query("gifts").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
      gift = gifts.filter((g) => g.status === "suggested" && g.arriveBy >= now - 86400000).sort((a, b) => a.arriveBy - b.arriveBy)[0] ?? null;
    }
    if (!gift || gift.ownerId !== user._id) return { user: { phone: user.phone, keikiOptIn: user.keikiOptIn }, gift: null };
    const person = await ctx.db.get(gift.personId);
    return { user: { phone: user.phone, keikiOptIn: user.keikiOptIn }, gift: gift._id, birthday: person ? nextBirthday(person.birthday, now) : null };
  },
});

export const sendBirthdayNotice = action({
  args: { userKey: v.optional(v.string()), giftId: v.optional(v.id("gifts")) },
  handler: async (ctx, { userKey, giftId }): Promise<{ sent: boolean; reason?: string; text?: string; result?: unknown }> => {
    const now = Date.now();
    const target = await ctx.runQuery(internal.keiki.noticeTarget, { userKey, giftId, now });
    if (!target.gift) return { sent: false, reason: "no suggested gift to tell the user about" };
    const gift = await ctx.runQuery(internal.gifts.get, { giftId: target.gift, now });
    if (!gift) return { sent: false, reason: "gift not found" };
    const when = target.birthday ? `${longDay(target.birthday.at)}${target.birthday.days === 0 ? " (today)" : target.birthday.days === 1 ? " (tomorrow)" : ` (in ${target.birthday.days} days)`}` : longDay(gift.arriveBy);
    const text = [
      `Notice: ${gift.person.name}'s ${gift.occasion} is ${when}.`,
      `Suggested gift (giftId ${gift._id}): ${gift.product.name}, $${gift.product.price}, arrives ${longDay(gift.arrives)}.`,
      `Reason: ${gift.reason}`,
      gift.alternatives.length ? `Alternatives: ${gift.alternatives.map((a) => `${a.name} ($${a.price})`).join("; ")}.` : "",
      "Tell the user and ask if they want to send it. Do not send it without their approval.",
    ]
      .filter(Boolean)
      .join(" ");
    if (!target.user.keikiOptIn) return { sent: false, reason: "user has not texted Kin yet (keikiOptIn is false)", text };
    const apiKey = process.env.KEIKI_API_KEY;
    const agentId = process.env.KEIKI_AGENT_ID;
    if (!apiKey || !agentId) {
      console.log(`keiki not configured: notice not sent: ${text}`);
      return { sent: false, reason: "keiki not configured", text };
    }
    const res = await fetch(`${KEIKI_BASE()}/api/v1/developer/agents/${agentId}/notice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, phone: target.user.phone }),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) console.log(`keiki notice failed: ${res.status} ${JSON.stringify(result)}`);
    return { sent: res.ok, text, result };
  },
});
