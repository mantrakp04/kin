import { z } from "zod";
import { v } from "convex/values";
import { httpAction, internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { claude } from "./assistant";
import { userByKey } from "./lib";

const AGENTCARD_BASE = "https://api.agentcard.sh/api/v1";
const RENTAHUMAN_BASE = "https://rentahuman.ai/api";
const DEMO_GAP_MS = 7000;
const POLL_MS = 60_000;
const MAX_POLLS = 2880;
const DEMO_HUMANS = ["Jordan", "Remy", "Talia", "Marco", "Ines"];

export const STEP_KEYS = ["paid", "card", "bought", "address", "hired", "wrapped", "delivered"] as const;
type StepKey = (typeof STEP_KEYS)[number];
type Order = Doc<"giftOrders">;

const first = (name: string) => name.split(" ")[0];
const dollars = (cents: number) => `$${Math.round(cents / 100)}`;
const demo = (text: string) => `${text} (demo)`;

const initialSteps = (recipient: string) => [
  { key: "paid", label: "Approved" },
  { key: "card", label: "Agentcard issued" },
  { key: "bought", label: "Bought with Agentcard" },
  { key: "address", label: `Waiting for ${recipient}'s address` },
  { key: "hired", label: "Courier hired on RentAHuman" },
  { key: "wrapped", label: "Picked up and wrapped" },
  { key: "delivered", label: "Delivered" },
];

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const claimUrl = (token: string) => `${process.env.CONVEX_SITE_URL ?? ""}/g/${token}`;

async function post(ctx: MutationCtx, order: Order, text: string, action: { type: string; payload: unknown }) {
  const thread = await ctx.db.query("agentThreads").withIndex("by_owner", (q) => q.eq("ownerId", order.ownerId)).first();
  if (!thread) return;
  await ctx.db.insert("agentMessages", { threadId: thread._id, ownerId: order.ownerId, role: "assistant", text, action, channel: "app", at: Date.now() });
}

async function mark(ctx: MutationCtx, order: Order, key: StepKey, detail: string | undefined, label?: string, patch: Partial<Order> = {}) {
  const idx = STEP_KEYS.indexOf(key);
  const now = Date.now();
  const steps = order.steps.map((s, i) => (s.key === key ? { ...s, label: label ?? s.label, detail, at: now } : i < idx && !s.at ? { ...s, at: now } : s));
  const current = STEP_KEYS[idx + 1] ?? "done";
  await ctx.db.patch(order._id, { ...patch, steps, current, ...(key === "delivered" ? { address: undefined } : {}) });
  const step = steps[idx];
  const gift = await ctx.db.get(order.giftId);
  const person = gift ? await ctx.db.get(gift.personId) : null;
  const who = person ? `${first(person.name)}'s gift` : "Gift";
  await post(ctx, order, `${who} · ${step.label}${detail ? ` · ${detail}` : ""}`, { type: "gift_step", payload: { giftId: order.giftId, key } });
}

export const context = internalQuery({
  args: { giftId: v.id("gifts") },
  handler: async (ctx, { giftId }) => {
    const gift = await ctx.db.get(giftId);
    if (!gift) return null;
    const [person, product, owner] = await Promise.all([ctx.db.get(gift.personId), ctx.db.get(gift.productId), ctx.db.get(gift.ownerId)]);
    if (!person || !product || !owner) return null;
    const order = await ctx.db.query("giftOrders").withIndex("by_gift", (q) => q.eq("giftId", giftId)).first();
    return {
      order,
      occasion: gift.occasion,
      reason: gift.reason,
      owner: { name: owner.name, firstName: first(owner.name) },
      person: { _id: person._id, name: person.name, firstName: first(person.name), city: person.city },
      product: { name: product.name, price: product.price },
    };
  },
});

export const create = internalMutation({
  args: { giftId: v.id("gifts"), payment: v.string(), paidDetail: v.string(), note: v.string() },
  handler: async (ctx, { giftId, payment, paidDetail, note }) => {
    const existing = await ctx.db.query("giftOrders").withIndex("by_gift", (q) => q.eq("giftId", giftId)).first();
    if (existing && existing.current !== "done") return null;
    if (existing) await ctx.db.delete(existing._id);
    const gift = await ctx.db.get(giftId);
    const person = gift ? await ctx.db.get(gift.personId) : null;
    if (!gift || !person) return null;
    const orderId = await ctx.db.insert("giftOrders", {
      giftId,
      ownerId: gift.ownerId,
      mode: payment === "demo" ? "demo" : "live",
      payment,
      token: randomToken(),
      current: "paid",
      steps: initialSteps(first(person.name)),
      note,
      at: Date.now(),
    });
    await mark(ctx, (await ctx.db.get(orderId))!, "paid", paidDetail);
    return orderId;
  },
});

export const reset = internalMutation({
  args: { giftId: v.id("gifts") },
  handler: async (ctx, { giftId }) => {
    const orders = await ctx.db.query("giftOrders").withIndex("by_gift", (q) => q.eq("giftId", giftId)).collect();
    for (const o of orders) await ctx.db.delete(o._id);
    return orders.length;
  },
});

export const advance = internalMutation({
  args: {
    orderId: v.id("giftOrders"),
    key: v.string(),
    detail: v.optional(v.string()),
    cardId: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardLimitCents: v.optional(v.number()),
    humanName: v.optional(v.string()),
    humanCity: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, key, detail, ...patch }) => {
    const order = await ctx.db.get(orderId);
    if (!order || !STEP_KEYS.includes(key as StepKey)) return false;
    const clean = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<Order>;
    if (order.steps.find((s) => s.key === key)?.at) return false;
    await mark(ctx, order, key as StepKey, detail, undefined, clean);
    return true;
  },
});

export const setFields = internalMutation({
  args: { orderId: v.id("giftOrders"), bountyId: v.optional(v.string()), polls: v.optional(v.number()), hiredDetail: v.optional(v.string()) },
  handler: async (ctx, { orderId, bountyId, polls, hiredDetail }) => {
    const order = await ctx.db.get(orderId);
    if (!order) return;
    const steps = hiredDetail ? order.steps.map((s) => (s.key === "hired" ? { ...s, detail: hiredDetail } : s)) : order.steps;
    await ctx.db.patch(orderId, { steps, ...(bountyId ? { bountyId } : {}), ...(polls !== undefined ? { polls } : {}) });
  },
});

export const order = internalQuery({
  args: { orderId: v.id("giftOrders") },
  handler: async (ctx, { orderId }) => ctx.db.get(orderId),
});

async function draftNote(c: { occasion: string; reason: string; owner: { firstName: string }; person: { firstName: string } }) {
  const fallback = `Happy ${c.occasion.toLowerCase()}, ${c.person.firstName}. Saw this and thought of you. Love, ${c.owner.firstName}`;
  try {
    const out = await claude(
      "Write a short handwritten gift note (at most 25 words) from the sender to the recipient. Warm and plain, no emoji, no exclamation marks. Sign with the sender's first name. Don't name the gift.",
      { sender: c.owner.firstName, recipient: c.person.firstName, occasion: c.occasion, whyThisGift: c.reason },
      z.object({ note: z.string() }),
      "fulfil.note",
    );
    return out?.note?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export const start = internalAction({
  args: { giftId: v.id("gifts"), payment: v.union(v.literal("agentcard"), v.literal("whop"), v.literal("demo")), reason: v.optional(v.string()) },
  handler: async (ctx, { giftId, payment, reason }): Promise<Id<"giftOrders"> | null> => {
    const c = await ctx.runQuery(internal.fulfil.context, { giftId });
    if (!c) return null;
    if (c.order && c.order.current !== "done") return c.order._id;
    const note = await draftNote(c);
    const tap = reason ? `Approved with your tap, ${reason}` : "Approved with your tap";
    const paidDetail = payment === "agentcard" ? "Approved with your tap" : payment === "whop" ? "Whop checkout" : demo(tap);
    const orderId = await ctx.runMutation(internal.fulfil.create, { giftId, payment, paidDetail, note });
    if (!orderId) return null;
    await ctx.scheduler.runAfter(payment === "agentcard" ? 0 : 5000, internal.fulfil.mintCard, { orderId });
    return orderId;
  },
});

async function agentcard(path: string, init: RequestInit = {}) {
  const res = await fetch(`${AGENTCARD_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.AGENTCARD_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`agentcard ${path} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as Record<string, any>;
}

export const mintCard = internalAction({
  args: { orderId: v.id("giftOrders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.runQuery(internal.fulfil.order, { orderId });
    if (!order) return;
    const c = await ctx.runQuery(internal.fulfil.context, { giftId: order.giftId });
    if (!c) return;
    const cap = Number(process.env.AGENTCARD_MAX_CENTS) || 15000;
    const limitCents = Math.min(cap, Math.ceil(c.product.price * 1.15 + 8) * 100);
    let card: { id?: string; last4: string; demo: boolean } = { last4: "4242", demo: true };
    if (order.payment === "agentcard" && process.env.AGENTCARD_ACCESS_TOKEN) {
      try {
        const res = await agentcard("/cards", { method: "POST", body: JSON.stringify({ amountCents: limitCents }) });
        const raw = (res.card ?? res.data ?? res) as Record<string, any>;
        const id = String(raw.id ?? raw.cardId ?? "");
        let last4 = String(raw.last4 ?? raw.lastFour ?? "");
        if (id && !last4) {
          const summary = await agentcard(`/cards/${id}`);
          last4 = String(summary.last4 ?? summary.lastFour ?? summary.card?.last4 ?? "");
        }
        if (id) card = { id, last4: last4 || "····", demo: false };
      } catch (e) {
        console.log("fulfil: agentcard mint failed, using a demo card:", e instanceof Error ? e.message : e);
      }
    }
    const detail = `Single-use ·· ${card.last4}, ${dollars(limitCents)} limit`;
    await ctx.runMutation(internal.fulfil.advance, { orderId, key: "card", detail: card.demo ? demo(detail) : detail, cardId: card.id, cardLast4: card.last4, cardLimitCents: limitCents });
    const bought = `${c.product.name}, $${Math.round(c.product.price)}, ready for pickup in ${c.person.city}`;
    await ctx.runMutation(internal.fulfil.advance, { orderId, key: "bought", detail: demo(bought) });
    await ctx.runMutation(internal.fulfil.askAddress, { orderId });
    if (!process.env.RENTAHUMAN_API_KEY) await ctx.scheduler.runAfter(9000, internal.fulfil.demoClaim, { orderId });
  },
});

export const askAddress = internalMutation({
  args: { orderId: v.id("giftOrders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order) return;
    const gift = await ctx.db.get(order.giftId);
    const person = gift ? await ctx.db.get(gift.personId) : null;
    if (!person) return;
    const name = first(person.name);
    const text = `Hi ${name}, I sent you a little something. Tell me where it should go: ${claimUrl(order.token)}`;
    await post(ctx, order, `${name} picks where it goes. Text this link from your phone. Kin uses the address only for delivery and never shows it to you.`, {
      type: "draft",
      payload: { personId: person._id, name: person.name, phone: person.phone ?? "", options: [text] },
    });
  },
});

const addressArg = v.object({ name: v.string(), line1: v.string(), line2: v.optional(v.string()), city: v.string(), region: v.string(), postal: v.string(), notes: v.optional(v.string()) });

async function claimed(ctx: MutationCtx, order: Order, detail: string, address?: Order["address"]) {
  if (order.current === "done" || order.steps.find((s) => s.key === "address")?.at) return false;
  const gift = await ctx.db.get(order.giftId);
  const person = gift ? await ctx.db.get(gift.personId) : null;
  await mark(ctx, order, "address", detail, `${person ? first(person.name) : "Their"}'s address`, address ? { address } : {});
  await ctx.scheduler.runAfter(process.env.RENTAHUMAN_API_KEY ? 0 : 6000, internal.fulfil.hire, { orderId: order._id });
  return true;
}

export const claim = internalMutation({
  args: { token: v.string(), address: addressArg },
  handler: async (ctx, { token, address }) => {
    const order = await ctx.db.query("giftOrders").withIndex("by_token", (q) => q.eq("token", token)).first();
    return order ? claimed(ctx, order, "Shared privately", address) : false;
  },
});

export const demoClaim = internalMutation({
  args: { orderId: v.id("giftOrders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    return order ? claimed(ctx, order, demo("Shared privately")) : false;
  },
});

async function rah(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const res = await fetch(`${RENTAHUMAN_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": process.env.RENTAHUMAN_API_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rentahuman ${path} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as Record<string, any>;
}

export const hire = internalAction({
  args: { orderId: v.id("giftOrders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.runQuery(internal.fulfil.order, { orderId });
    if (!order) return;
    const c = await ctx.runQuery(internal.fulfil.context, { giftId: order.giftId });
    if (!c) return;
    if (process.env.RENTAHUMAN_API_KEY) {
      try {
        const res = await rah("/bounties", {
          method: "POST",
          idempotencyKey: `kin-gift-${orderId}`,
          body: JSON.stringify({
            agentType: "other",
            title: `Pick up, gift-wrap and deliver a gift in ${c.person.city}`,
            description: [
              `Pick up a prepaid ${c.product.name} order in ${c.person.city}. Pickup details come in the job chat once you're accepted. You never pay for the item and never receive card details.`,
              "Gift-wrap it neatly and add a handwritten card with exactly this note:",
              `"${order.note}"`,
              `Deliver it the same day to an address in ${c.person.city}. The exact address is sent privately in the job chat after you're accepted.`,
            ].join("\n\n"),
            completionCriteria: "Gift wrapped with the handwritten note and delivered, with a photo of the wrapped gift at the door",
            evidenceTypes: ["photo"],
            estimatedHours: 2,
            priceType: "fixed",
            price: Number(process.env.RENTAHUMAN_BUDGET) || 40,
            autoAccept: true,
            location: { country: "US", city: c.person.city, isRemoteAllowed: false },
          }),
        });
        const bountyId = String(res.bounty?.id ?? res.id ?? res.bountyId ?? "");
        if (bountyId) {
          await ctx.runMutation(internal.fulfil.setFields, { orderId, bountyId, hiredDetail: `Posted on RentAHuman in ${c.person.city}` });
          await ctx.scheduler.runAfter(POLL_MS, internal.fulfil.poll, { orderId });
          return;
        }
        console.log("fulfil: rentahuman bounty had no id");
      } catch (e) {
        console.log("fulfil: rentahuman bounty failed, continuing in demo:", e instanceof Error ? e.message : e);
      }
    }
    const humanName = DEMO_HUMANS[order.token.charCodeAt(0) % DEMO_HUMANS.length];
    await ctx.runMutation(internal.fulfil.advance, { orderId, key: "hired", detail: demo(`${humanName}, ${c.person.city}, $${Number(process.env.RENTAHUMAN_BUDGET) || 40} flat`), humanName, humanCity: c.person.city });
    await ctx.scheduler.runAfter(DEMO_GAP_MS, internal.fulfil.demoStep, { orderId, key: "wrapped" });
  },
});

const DEMO_DETAIL: Record<string, string> = {
  wrapped: "Collected the order, wrapped it, wrote the note by hand",
  delivered: "Handed over at the door, photo taken",
};

export const demoStep = internalMutation({
  args: { orderId: v.id("giftOrders"), key: v.string() },
  handler: async (ctx, { orderId, key }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.current !== key) return;
    await mark(ctx, order, key as StepKey, demo(DEMO_DETAIL[key] ?? "Done"));
    const next = STEP_KEYS[STEP_KEYS.indexOf(key as StepKey) + 1];
    if (next) await ctx.scheduler.runAfter(DEMO_GAP_MS, internal.fulfil.demoStep, { orderId, key: next });
  },
});

export const poll = internalAction({
  args: { orderId: v.id("giftOrders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.runQuery(internal.fulfil.order, { orderId });
    if (!order || !order.bountyId || order.current === "done") return;
    const polls = (order.polls ?? 0) + 1;
    await ctx.runMutation(internal.fulfil.setFields, { orderId, polls });
    try {
      if (order.current === "hired") {
        const apps = await rah(`/bounties/${order.bountyId}/applications`);
        const list = (apps.applications ?? apps.data ?? []) as Array<Record<string, any>>;
        const accepted = list.find((a) => String(a.status ?? "").toLowerCase() === "accepted");
        if (accepted) {
          const human = (accepted.human ?? accepted.applicant ?? {}) as Record<string, any>;
          const humanName = first(String(human.name ?? human.displayName ?? accepted.humanName ?? "Courier"));
          const humanCity = String(human.city ?? human.location ?? "");
          await ctx.runMutation(internal.fulfil.advance, { orderId, key: "hired", detail: humanCity ? `${humanName}, ${humanCity}` : humanName, humanName, humanCity: humanCity || undefined });
          await ctx.runAction(internal.fulfil.sendAddress, { orderId });
        }
      }
      if (["bought", "wrapped", "delivered"].includes(order.current)) {
        const subs = await rah(`/bounties/${order.bountyId}/submissions`);
        const list = (subs.submissions ?? subs.data ?? []) as Array<Record<string, any>>;
        if (list.length) {
          const files = (list[0].files ?? list[0].evidence ?? []) as Array<Record<string, any>>;
          const photoUrl = files.map((f) => f.url ?? f.fileUrl).find((u): u is string => typeof u === "string");
          await ctx.runMutation(internal.fulfil.advance, { orderId, key: "wrapped", detail: "Note written by hand" });
          await ctx.runMutation(internal.fulfil.advance, { orderId, key: "delivered", detail: photoUrl ? "Photo proof" : "Confirmed by the courier", photoUrl });
          if (order.cardId && process.env.AGENTCARD_ACCESS_TOKEN) await agentcard(`/cards/${order.cardId}`, { method: "DELETE" }).catch(() => null);
          return;
        }
      }
    } catch (e) {
      console.log("fulfil: poll failed:", e instanceof Error ? e.message : e);
    }
    if (polls < MAX_POLLS) await ctx.scheduler.runAfter(POLL_MS, internal.fulfil.poll, { orderId });
  },
});

export const sendAddress = internalAction({
  args: { orderId: v.id("giftOrders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.runQuery(internal.fulfil.order, { orderId });
    if (!order?.bountyId || !order.address) return;
    const convs = await rah("/conversations");
    const list = (convs.conversations ?? convs.data ?? []) as Array<Record<string, any>>;
    const conv = list.find((c) => String(c.bountyId ?? c.bounty?.id ?? "") === order.bountyId);
    if (!conv?.id) return console.log("fulfil: no bounty conversation yet for the address");
    const a = order.address;
    const lines = [`Deliver to ${a.name}`, a.line1, a.line2, `${a.city}, ${a.region} ${a.postal}`, a.notes ? `Notes: ${a.notes}` : undefined].filter(Boolean);
    await rah(`/conversations/${conv.id}/messages`, { method: "POST", body: JSON.stringify({ content: `${lines.join("\n")}\n\nPlease keep this address private and delete it after delivery.` }) });
  },
});

export const forGift = query({
  args: { userKey: v.optional(v.string()), giftId: v.string() },
  handler: async (ctx, { userKey, giftId }) => {
    const user = await userByKey(ctx, userKey);
    const id = ctx.db.normalizeId("gifts", giftId);
    if (!id) return null;
    const order = await ctx.db.query("giftOrders").withIndex("by_gift", (q) => q.eq("giftId", id)).first();
    if (!order || order.ownerId !== user._id) return null;
    const gift = await ctx.db.get(id);
    const [person, product] = gift ? await Promise.all([ctx.db.get(gift.personId), ctx.db.get(gift.productId)]) : [null, null];
    return {
      _id: order._id,
      mode: order.mode,
      payment: order.payment,
      current: order.current,
      steps: order.steps,
      note: order.note,
      card: order.cardLast4 ? { last4: order.cardLast4, limitCents: order.cardLimitCents ?? null } : null,
      human: order.humanName ? { name: order.humanName, city: order.humanCity ?? null } : null,
      photoUrl: order.photoUrl ?? null,
      claimUrl: claimUrl(order.token),
      recipient: person ? first(person.name) : null,
      product: product?.name ?? null,
    };
  },
});

export const pageData = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const order = await ctx.db.query("giftOrders").withIndex("by_token", (q) => q.eq("token", token)).first();
    if (!order) return null;
    const gift = await ctx.db.get(order.giftId);
    const [person, owner] = gift ? await Promise.all([ctx.db.get(gift.personId), ctx.db.get(gift.ownerId)]) : [null, null];
    if (!person || !owner) return null;
    return { sender: first(owner.name), recipient: first(person.name), city: person.city, closed: order.current === "done" || !!order.steps.find((s) => s.key === "address")?.at };
  },
});

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;font:16px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#1B1A22;background:linear-gradient(135deg,#E4E2F7 0%,#F8EDF5 45%,#FDE6E9 75%,#EAE9F9 100%);display:flex;justify-content:center;padding:48px 20px}
main{width:100%;max-width:440px}.label{font:10.5px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:1.4px;text-transform:uppercase;color:rgba(27,26,34,.46)}
h1{font-family:ui-serif,"New York",Georgia,serif;font-weight:400;font-size:40px;letter-spacing:-.8px;line-height:1.08;margin:10px 0 12px}p{color:rgba(27,26,34,.66);margin:0 0 24px}
.card{background:rgba(255,255,255,.62);border:1px solid rgba(27,26,34,.07);border-radius:24px;padding:20px;box-shadow:0 12px 26px -16px rgba(27,22,64,.3),0 1px 1px rgba(0,0,0,.02)}
label{display:block;font-size:13px;color:rgba(27,26,34,.46);margin:0 0 6px}input,textarea{width:100%;font:inherit;color:inherit;background:#FCFCFC;border:1px solid rgba(27,26,34,.14);border-radius:16px;padding:12px 14px;margin:0 0 14px;outline:none;box-shadow:inset 0 1px 1px rgba(0,0,0,.04)}
input:focus,textarea:focus{border-color:#3139FB}.row{display:flex;gap:10px}.row>div{flex:1}button{width:100%;font-family:inherit;font-size:16px;font-weight:600;color:#fff;background:#1B1A22;border:0;border-radius:999px;padding:16px;margin-top:6px;cursor:pointer;box-shadow:0 1px 1px rgba(0,0,0,.1)}
.fine{font-size:13px;color:rgba(27,26,34,.46);margin:16px 4px 0}</style></head><body><main>${body}</main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );
}

const tokenOf = (request: Request) => decodeURIComponent(new URL(request.url).pathname.replace(/^\/g\//, "").split("/")[0] ?? "");
const expired = () => page("Link expired", `<div class="label">Kin</div><h1>This link has expired</h1><p>Ask whoever sent it for a new one.</p>`);
const thanks = (sender: string) =>
  page("Thank you", `<div class="label">Kin</div><h1>It's on its way</h1><p>Thank you. ${esc(sender)} won't see your address. It's used only for this delivery and deleted once the gift arrives.</p>`);

export const claimGet = httpAction(async (ctx, request) => {
  const data = await ctx.runQuery(internal.fulfil.pageData, { token: tokenOf(request) });
  if (!data) return expired();
  if (data.closed) return thanks(data.sender);
  const s = esc(data.sender);
  return page(
    `${data.sender} sent you a gift`,
    `<div class="label">Kin · For ${esc(data.recipient)}</div><h1>${s} sent you a gift</h1><p>Where should it go? Only the courier sees your address, only for this delivery. ${s} never does.</p>
<form class="card" method="post" data-testid="gift-claim-form">
<label for="name">Name</label><input id="name" name="name" autocomplete="name" required value="${esc(data.recipient)}">
<label for="line1">Street address</label><input id="line1" name="line1" autocomplete="address-line1" required>
<label for="line2">Apartment, suite (optional)</label><input id="line2" name="line2" autocomplete="address-line2">
<div class="row"><div><label for="city">City</label><input id="city" name="city" autocomplete="address-level2" required value="${esc(data.city)}"></div><div><label for="region">State</label><input id="region" name="region" autocomplete="address-level1" required></div></div>
<label for="postal">ZIP</label><input id="postal" name="postal" autocomplete="postal-code" inputmode="numeric" required>
<label for="notes">Delivery notes (optional)</label><textarea id="notes" name="notes" rows="2"></textarea>
<button type="submit">Send it here</button></form><div class="fine">Deleted once the gift arrives.</div>`,
  );
});

export const claimPost = httpAction(async (ctx, request) => {
  const token = tokenOf(request);
  const data = await ctx.runQuery(internal.fulfil.pageData, { token });
  if (!data) return expired();
  if (data.closed) return thanks(data.sender);
  const form = new URLSearchParams(await request.text());
  const field = (k: string, max = 200) => (form.get(k) ?? "").trim().slice(0, max);
  const address = { name: field("name", 120), line1: field("line1"), line2: field("line2") || undefined, city: field("city", 120), region: field("region", 60), postal: field("postal", 20), notes: field("notes", 300) || undefined };
  if (!address.name || !address.line1 || !address.city || !address.region || !address.postal) {
    return page("Missing details", `<div class="label">Kin</div><h1>A few details are missing</h1><p><a href="">Go back</a> and fill in the street, city, state and ZIP.</p>`);
  }
  await ctx.runMutation(internal.fulfil.claim, { token, address });
  return thanks(data.sender);
});
