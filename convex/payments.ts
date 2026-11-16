import { action, httpAction, internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const WHOP_API_VERSION = "2026-11-14-1";
const SIMULATED_FULFILMENT_MS = 1500;

const whopBase = () => (process.env.WHOP_ENVIRONMENT === "production" ? "https://api.whop.com/api/v1" : "https://sandbox-api.whop.com/api/v1");

export const setVia = internalMutation({
  args: { giftId: v.id("gifts"), via: v.union(v.literal("app"), v.literal("imessage")) },
  handler: async (ctx, { giftId, via }) => {
    await ctx.db.patch(giftId, { via });
  },
});

export const setCheckout = internalMutation({
  args: { giftId: v.id("gifts"), checkoutId: v.string() },
  handler: async (ctx, { giftId, checkoutId }) => {
    await ctx.db.patch(giftId, { checkoutId });
  },
});

export async function chargeGift(ctx: ActionCtx, giftId: Id<"gifts">, via: "app" | "imessage"): Promise<{ url: string | null; simulated: boolean }> {
  const gift = await ctx.runQuery(internal.gifts.get, { giftId });
  if (!gift) throw new Error("Gift not found");
  if (gift.status === "paid" || gift.status === "ordered") return { url: null, simulated: false };
  if (gift.problem) throw new Error(`Can't send this gift: ${gift.problem}`);
  await ctx.runMutation(internal.payments.setVia, { giftId, via });

  const fulfil = async (payment: "agentcard" | "demo", reason?: string) => {
    await ctx.scheduler.runAfter(0, internal.gifts.markPaid, { giftId, via });
    await ctx.scheduler.runAfter(SIMULATED_FULFILMENT_MS, internal.gifts.markOrdered, { giftId });
    await ctx.scheduler.runAfter(0, internal.fulfil.start, { giftId, payment, reason });
    return { url: null, simulated: true };
  };
  if (process.env.AGENTCARD_ACCESS_TOKEN) return fulfil("agentcard");

  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) {
    console.log("whop not configured: simulated payment");
    return fulfil("demo");
  }

  const accountId = process.env.WHOP_ACCOUNT_ID ?? process.env.WHOP_COMPANY_ID;
  const res: Response | null = await fetch(`${whopBase()}/checkout_configurations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Api-Version-Date": WHOP_API_VERSION,
      "Idempotency-Key": `kin-${giftId}-${gift.product._id}`,
    },
    body: JSON.stringify({
      metadata: { giftId },
      ...(process.env.WHOP_REDIRECT_URL ? { redirect_url: process.env.WHOP_REDIRECT_URL } : {}),
      variant: {
        title: gift.product.name,
        description: `A gift for ${gift.person.firstName}`,
        billing_type: "one_time",
        initial_price: gift.product.price,
        currency: "usd",
        ...(accountId ? { account_id: accountId } : {}),
      },
    }),
  }).catch(() => null);
  if (!res?.ok) {
    console.log(`Whop checkout failed (${res?.status ?? "network"}): falling back to the demo pipeline`);
    return fulfil("demo", "Whop unavailable");
  }
  const checkout = (await res.json()) as { id: string; purchase_url: string };
  await ctx.runMutation(internal.payments.setCheckout, { giftId, checkoutId: checkout.id });
  return { url: checkout.purchase_url, simulated: false };
}

export const startCheckout = action({
  args: { userKey: v.optional(v.string()), giftId: v.id("gifts"), productId: v.optional(v.id("products")) },
  handler: async (ctx, { userKey, giftId, productId }): Promise<{ url: string | null }> => {
    const gift = await ctx.runQuery(internal.gifts.get, { giftId });
    if (!gift || gift.ownerKey !== (userKey ?? "alex")) throw new Error("Gift not found");
    if (productId && productId !== gift.product._id) await ctx.runMutation(internal.gifts.swapProduct, { giftId, productId });
    const { url } = await chargeGift(ctx, giftId, "app");
    return { url };
  },
});

export const paidFromWebhook = internalMutation({
  args: { giftId: v.optional(v.string()), checkoutId: v.optional(v.string()), paymentId: v.string() },
  handler: async (ctx, { giftId, checkoutId, paymentId }) => {
    const id = giftId ? ctx.db.normalizeId("gifts", giftId) : null;
    const gift = id
      ? await ctx.db.get(id)
      : checkoutId
        ? await ctx.db.query("gifts").withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutId)).first()
        : null;
    if (!gift) return false;
    if (gift.status !== "suggested") return gift.status === "paid" || gift.status === "ordered";
    await ctx.db.patch(gift._id, { status: "paid", paymentId, via: gift.via ?? "app" });
    await ctx.scheduler.runAfter(SIMULATED_FULFILMENT_MS, internal.gifts.markOrdered, { giftId: gift._id });
    await ctx.scheduler.runAfter(0, internal.fulfil.start, { giftId: gift._id, payment: "whop" });
    return true;
  },
});

function base64(bytes: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWhop(raw: string, headers: Headers, secret: string) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`)));
  return signatures.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && !!value && safeEqual(value, expected);
  });
}

export const whopWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) return new Response("whop webhook not configured", { status: 503 });
  const raw = await request.text();
  if (!(await verifyWhop(raw, request.headers, secret))) return new Response("invalid signature", { status: 401 });
  const event = JSON.parse(raw) as { type: string; data?: { id?: string; metadata?: { giftId?: string } | null; checkout_configuration_id?: string | null } };
  if (event.type === "payment.succeeded" && event.data?.id) {
    const ok = await ctx.runMutation(internal.payments.paidFromWebhook, {
      giftId: event.data.metadata?.giftId ?? undefined,
      checkoutId: event.data.checkout_configuration_id ?? undefined,
      paymentId: event.data.id,
    });
    if (!ok) console.log(`whop payment ${event.data.id} matched no gift`);
  }
  return new Response("ok", { status: 200 });
});
