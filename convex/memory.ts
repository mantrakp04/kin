import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const BASE = (process.env.SUPERMEMORY_BASE_URL ?? "https://api.supermemory.ai").replace(/\/$/, "");
const namespace = (personId: Id<"people">) => `person_${personId}`;
type MemoryDoc = { personId: Id<"people">; content: string; metadata: Record<string, string> };
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

async function supermemory(path: string, body: unknown): Promise<any | null> {
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log(`supermemory ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.log(`supermemory ${path} failed: ${String(e)}`);
    return null;
  }
}

function addDocument(personId: Id<"people">, id: string, content: string, metadata: Record<string, string>) {
  return supermemory(`/ns/${namespace(personId)}/document`, { content, id, metadata, dreaming: "instant" });
}

export const updateDoc = internalQuery({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }): Promise<MemoryDoc | null> => {
    const u = await ctx.db.get(updateId);
    if (!u) return null;
    const person = await ctx.db.get(u.personId);
    if (!person) return null;
    return {
      personId: u.personId,
      content: `${day(u.at)}: ${person.name} (${u.kind}, ${u.source}): ${u.text}${u.place ? ` Place: ${u.place}.` : ""}`,
      metadata: { type: "update", kind: u.kind, source: u.source, date: day(u.at) },
    };
  },
});

export const giftDoc = internalQuery({
  args: { giftId: v.id("gifts") },
  handler: async (ctx, { giftId }): Promise<MemoryDoc | null> => {
    const g = await ctx.db.get(giftId);
    if (!g) return null;
    const [person, product, owner] = await Promise.all([ctx.db.get(g.personId), ctx.db.get(g.productId), ctx.db.get(g.ownerId)]);
    if (!person || !product) return null;
    return {
      personId: g.personId,
      content: `${day(g.at)}: ${owner?.name ?? "The user"} sent ${person.name} a gift for ${g.occasion}: ${product.name} ($${product.price}, tags: ${product.tags.join(", ")}). Why: ${g.reason}`,
      metadata: { type: "gift", occasion: g.occasion, productKey: product.key, date: day(g.at) },
    };
  },
});

export const allUpdateIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"updates">[]> => (await ctx.db.query("updates").collect()).map((u) => u._id),
});

export const rememberUpdate = internalAction({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }): Promise<unknown> => {
    if (!process.env.SUPERMEMORY_API_KEY) return null;
    const doc: MemoryDoc | null = await ctx.runQuery(internal.memory.updateDoc, { updateId });
    if (!doc) return null;
    return await addDocument(doc.personId, `update_${updateId}`, doc.content, doc.metadata);
  },
});

export const rememberGift = internalAction({
  args: { giftId: v.id("gifts") },
  handler: async (ctx, { giftId }): Promise<unknown> => {
    if (!process.env.SUPERMEMORY_API_KEY) {
      console.log("SUPERMEMORY_API_KEY not set: rememberGift skipped");
      return null;
    }
    const doc: MemoryDoc | null = await ctx.runQuery(internal.memory.giftDoc, { giftId });
    if (!doc) return null;
    return await addDocument(doc.personId, `gift_${giftId}`, doc.content, doc.metadata);
  },
});

export const rememberNote = internalAction({
  args: { personId: v.id("people"), id: v.string(), content: v.string(), metadata: v.record(v.string(), v.string()) },
  handler: async (_ctx, { personId, id, content, metadata }): Promise<unknown> => {
    if (!process.env.SUPERMEMORY_API_KEY) return null;
    return await addDocument(personId, id, content, metadata);
  },
});

export const recall = internalAction({
  args: { personId: v.id("people"), query: v.string() },
  handler: async (_ctx, { personId, query }): Promise<{ profile: string[]; memories: string[] }> => {
    if (!process.env.SUPERMEMORY_API_KEY) return { profile: [], memories: [] };
    const ns = namespace(personId);
    const [profile, search] = await Promise.all([
      supermemory(`/ns/${ns}/profile`, {}),
      supermemory(`/ns/${ns}/search`, { query, searchMode: "memories", limit: 5 }),
    ]);
    const entries = [...(profile?.profile?.static ?? []), ...(profile?.profile?.dynamic ?? [])];
    return {
      profile: entries.map((m: { memory?: string }) => m.memory).filter((m: unknown): m is string => typeof m === "string"),
      memories: (search?.results ?? []).map((r: { memory?: string; chunk?: string }) => r.memory ?? r.chunk).filter((m: unknown): m is string => typeof m === "string"),
    };
  },
});

export const list = internalAction({
  args: { personId: v.id("people") },
  handler: async (_ctx, { personId }): Promise<unknown> => {
    if (!process.env.SUPERMEMORY_API_KEY) return { configured: false };
    return await supermemory(`/ns/${namespace(personId)}/list/documents?limit=50`, {});
  },
});

export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{ written: number; total?: number }> => {
    if (!process.env.SUPERMEMORY_API_KEY) {
      console.log("SUPERMEMORY_API_KEY not set: backfill skipped");
      return { written: 0 };
    }
    const ids: Id<"updates">[] = await ctx.runQuery(internal.memory.allUpdateIds, {});
    let written = 0;
    for (let i = 0; i < ids.length; i += 8) {
      const results = await Promise.all(
        ids.slice(i, i + 8).map(async (updateId) => {
          const doc: MemoryDoc | null = await ctx.runQuery(internal.memory.updateDoc, { updateId });
          return doc ? addDocument(doc.personId, `update_${updateId}`, doc.content, doc.metadata) : null;
        }),
      );
      written += results.filter(Boolean).length;
    }
    return { written, total: ids.length };
  },
});
