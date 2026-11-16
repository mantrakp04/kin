import { z } from "zod";
import { action, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { DAY, userByKey } from "./lib";
import { claude } from "./assistant";

type Tier = "inner" | "close" | "catching_up" | "dormant";
type Kind = "you" | "social" | "chat";

const TIERS: Tier[] = ["inner", "close", "catching_up", "dormant"];
const TIER_BASE: Record<Tier, number> = { inner: 0.82, close: 0.6, catching_up: 0.36, dormant: 0.14 };
const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", imessage: "iMessage" };
const TOOLKIT_LABEL = { twitter: "X", instagram: "Instagram", linkedin: "LinkedIn" } as const;

const INTEREST_GROUPS: Array<[RegExp, string]> = [
  [/climb|boulder/, "Climbing"],
  [/run|marathon|10k|race/, "Running"],
  [/cycl|bike/, "Cycling"],
  [/surf|scuba|swim|rowing|sailing/, "Water"],
  [/hik|trail|camp/, "Outdoors"],
  [/coffee|espresso|pour-over|latte|matcha|tea\b|oolong/, "Coffee"],
  [/ceramic|pottery/, "Ceramics"],
  [/photo/, "Photography"],
  [/jazz|music|techno|synth|vinyl|city pop|fado|bossa|carnatic|musical/, "Music"],
  [/cook|baking|bread|pasta|ferment|ramen|taco|barbecue|wine|mezcal|beer|cocktail|food/, "Food"],
  [/architect|furniture|brutal|houses/, "Architecture"],
  [/design|typograph|type design|risograph|zine/, "Design"],
  [/book|fiction|poetry|novel|crossword|rooney/, "Books"],
  [/product/, "Product"],
  [/game|chess/, "Games"],
];

const canonInterest = (s: string) => {
  const low = s.toLowerCase();
  return INTEREST_GROUPS.find(([re]) => re.test(low))?.[1] ?? low;
};
const company = (role: string) => role.match(/\b(?:at|of)\s+(.+)$/)?.[1]?.replace(/\s*\(.*\)$/, "").trim() ?? null;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
const area = (p: Doc<"people">) => (/\bbrooklyn\b/i.test(p.note ?? "") ? "Brooklyn" : p.city);

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function closeness(p: Doc<"people">, stats: Doc<"relationshipStats"> | undefined, gifts: number, now: number): { tier: Tier; score: number } {
  if (stats) {
    const recent = stats.lastAt ? Math.max(0, 1 - (now - stats.lastAt) / (180 * DAY)) : 0;
    const volume = Math.min(1, Math.log10(stats.messageCount + 1) / 4);
    return { tier: stats.tier, score: Math.min(1, TIER_BASE[stats.tier] + 0.1 * volume + 0.06 * recent) };
  }
  const days = p.lastContactAt ? (now - p.lastContactAt) / DAY : Infinity;
  let score = p.close ? 0.34 : 0.04;
  score += days <= 14 ? 0.4 : days <= 30 ? 0.3 : days <= 60 ? 0.22 : days <= 120 ? 0.14 : days <= 365 ? 0.06 : 0;
  score += Math.min(0.16, gifts * 0.08);
  if (p.birthday) score += 0.03;
  if (p.linkedUserId) score += 0.04;
  score = Math.min(1, score);
  const tier: Tier = score >= 0.68 ? "inner" : score >= 0.48 ? "close" : score >= 0.2 ? "catching_up" : "dormant";
  return { tier, score: Math.max(0.08, score) };
}

function heuristicName(ps: Doc<"people">[]) {
  const top = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const x of values) counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  };
  const half = Math.max(2, Math.ceil(ps.length * 0.4));
  const work = top(ps.map((p) => company(p.role)).filter((c): c is string => !!c));
  if (work && work[1] >= half) return work[0];
  const place = top(ps.map(area));
  const interest = top(ps.flatMap((p) => [...new Set(p.interests.map(canonInterest))]));
  if (place && place[1] >= ps.length * 0.6) return interest && interest[1] >= half ? place[0] + " " + interest[0].toLowerCase() : place[0];
  if (interest && interest[1] >= half) return interest[0];
  return place?.[0] ?? "Friends";
}

async function compute(ctx: QueryCtx, userKey: string | undefined) {
  const user = await userByKey(ctx, userKey);
  const now = Date.now();
  const people = (await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect())
    .filter((p) => p.linkedUserId !== user._id)
    .sort((a, b) => a.key.localeCompare(b.key));
  const [stats, chatEdges, socialEdges, gifts] = await Promise.all([
    ctx.db.query("relationshipStats").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
    ctx.db.query("chatEdges").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
    ctx.db.query("socialEdges").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
    ctx.db.query("gifts").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
  ]);

  const index = new Map<Id<"people">, number>(people.map((p, i) => [p._id, i + 1]));
  const statsBy = new Map(stats.map((s) => [s.personId, s]));
  const giftsBy = new Map<Id<"people">, number>();
  for (const g of gifts) if (g.status === "paid" || g.status === "ordered") giftsBy.set(g.personId, (giftsBy.get(g.personId) ?? 0) + 1);

  const pairs = new Map<string, { a: number; b: number; weight: number; via: Set<string>; kind: Kind }>();
  const via = people.map(() => new Set<string>());
  const link = (x: number, y: number, w: number, label: string, kind: Kind) => {
    if (x === y) return;
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = a + ":" + b;
    const e = pairs.get(key);
    if (!e) pairs.set(key, { a, b, weight: w, via: new Set([label]), kind });
    else {
      e.weight = 1 - (1 - e.weight) * (1 - w);
      e.via.add(label);
      if (kind === "chat") e.kind = "chat";
    }
    via[a - 1].add(label);
    via[b - 1].add(label);
  };
  for (const s of socialEdges) {
    const a = index.get(s.personId);
    const b = s.otherPersonId && index.get(s.otherPersonId);
    if (!a || !b) continue;
    link(a, b, s.relation === "mutual" || s.relation === "connection" ? 0.55 : 0.35, TOOLKIT_LABEL[s.toolkit], "social");
  }
  for (const c of chatEdges) {
    const a = index.get(c.personId);
    const b = index.get(c.otherPersonId);
    if (!a || !b) continue;
    link(a, b, Math.min(0.95, 0.5 + 0.1 * c.groups), "Group chat", "chat");
  }

  const nodes = people.map((p, i) => {
    const s = statsBy.get(p._id);
    const { tier, score } = closeness(p, s, giftsBy.get(p._id) ?? 0, now);
    const connected = [...(s?.sources ?? []).map((x) => SOURCE_LABEL[x] ?? x), ...(s && s.groupsTogether > 0 ? ["Group chat"] : []), ...via[i]];
    return {
      id: p._id as string,
      key: p.key,
      name: p.name,
      initials: initials(p.name),
      hue: p.hue,
      city: p.city,
      role: p.role,
      tier,
      closeness: Math.round(score * 100) / 100,
      via: [...new Set(connected)],
      degree: 0,
      cluster: null as string | null,
    };
  });
  const edges = [...pairs.values()].map((e) => ({ a: e.a, b: e.b, weight: Math.round(e.weight * 100) / 100, kind: e.kind, via: [...e.via] }));
  for (const e of edges) {
    nodes[e.a - 1].degree++;
    nodes[e.b - 1].degree++;
  }

  const n = people.length;
  const sim = people.map(() => new Map<number, number>());
  const bump = (a: number, b: number, w: number) => {
    if (a === b) return;
    sim[a].set(b, (sim[a].get(b) ?? 0) + w);
    sim[b].set(a, (sim[b].get(a) ?? 0) + w);
  };
  for (const e of edges) bump(e.a - 1, e.b - 1, 2 + e.weight);
  const groupBy = (keyOf: (p: Doc<"people">) => string[], w: number, maxShare: number) => {
    const groups = new Map<string, number[]>();
    people.forEach((p, i) => {
      for (const k of new Set(keyOf(p))) groups.set(k, [...(groups.get(k) ?? []), i]);
    });
    for (const members of groups.values()) {
      if (members.length < 2 || members.length > Math.max(3, n * maxShare)) continue;
      const span = Math.min(members.length - 1, 8);
      const ww = (w * (1 - members.length / n)) / (span < members.length - 1 ? 1 : 2);
      members.forEach((m, j) => {
        for (let d = 1; d <= span; d++) bump(m, members[(j + d) % members.length], ww);
      });
    }
  };
  groupBy((p) => {
    const c = company(p.role);
    return c ? [c.toLowerCase()] : [];
  }, 2, 1);
  groupBy((p) => [area(p)], 1, 0.5);
  groupBy((p) => p.interests.map(canonInterest), 0.5, 0.25);

  const labels = people.map((p) => p.key);
  const deg = sim.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const total = deg.reduce((a, b) => a + b, 0) || 1;
  const size = new Map(labels.map((l, i) => [l, deg[i]]));
  for (let round = 0; round < 30; round++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const own = labels[i];
      size.set(own, size.get(own)! - deg[i]);
      const pull = new Map<string, number>([[own, 0]]);
      for (const [j, w] of sim[i]) pull.set(labels[j], (pull.get(labels[j]) ?? 0) + w);
      let best = own;
      let bestScore = -Infinity;
      for (const [l, w] of pull) {
        const score = w - (deg[i] * (size.get(l) ?? 0)) / total;
        if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) < 1e-9 && l < best)) [best, bestScore] = [l, score];
      }
      labels[i] = best;
      size.set(best, (size.get(best) ?? 0) + deg[i]);
      if (best !== own) changed = true;
    }
    if (!changed) break;
  }

  const members = new Map<string, number[]>();
  labels.forEach((l, i) => members.set(l, [...(members.get(l) ?? []), i]));
  const clusters = [...members.entries()]
    .filter(([, m]) => m.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([id, m]) => {
      for (const i of m) nodes[i].cluster = id;
      return { id, size: m.length, name: heuristicName(m.map((i) => people[i])), members: m };
    });
  const used = new Set<string>();
  for (const c of clusters) {
    if (used.has(c.name)) c.name = c.name + " · " + people[c.members[0]].city;
    used.add(c.name);
  }
  const signature = hash(clusters.map((c) => c.members.map((i) => people[i].key).join(",")).join("|"));
  return { user, people, nodes, edges, clusters, signature };
}

async function cachedNames(ctx: QueryCtx, ownerId: Id<"users">, signature: string) {
  return await ctx.db
    .query("graphClusterNames")
    .withIndex("by_owner_signature", (q) => q.eq("ownerId", ownerId).eq("signature", signature))
    .first();
}

export const get = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const { user, nodes, edges, clusters, signature } = await compute(ctx, userKey);
    const cached = await cachedNames(ctx, user._id, signature);
    const names = new Map((cached?.names ?? []).map((n) => [n.id, n.name]));
    const you = {
      id: "you",
      key: user.key,
      name: user.name,
      initials: initials(user.name),
      hue: user.hue,
      city: user.city,
      role: user.role,
      tier: "inner" as Tier,
      closeness: 1,
      via: [] as string[],
      degree: nodes.length,
      cluster: null as string | null,
    };
    return {
      nodes: [you, ...nodes],
      edges: [...nodes.map((n, i) => ({ a: 0, b: i + 1, weight: n.closeness, kind: "you" as Kind, via: n.via })), ...edges],
      clusters: clusters.map((c) => ({ id: c.id, size: c.size, name: names.get(c.id) ?? c.name })),
      tiers: TIERS.map((t) => ({ tier: t, count: nodes.filter((n) => n.tier === t).length })),
      signature,
      named: !!cached,
    };
  },
});

export const clusterInput = internalQuery({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const { user, people, clusters, signature } = await compute(ctx, userKey);
    const cached = await cachedNames(ctx, user._id, signature);
    return {
      ownerId: user._id,
      signature,
      cached: !!cached,
      clusters: clusters.map((c) => ({
        id: c.id,
        fallback: c.name,
        people: c.members.slice(0, 14).map((i) => ({ role: people[i].role, city: area(people[i]), interests: people[i].interests, note: people[i].note ?? null })),
      })),
    };
  },
});

export const saveNames = internalMutation({
  args: { ownerId: v.id("users"), signature: v.string(), names: v.array(v.object({ id: v.string(), name: v.string() })) },
  handler: async (ctx, { ownerId, signature, names }) => {
    for (const old of await ctx.db.query("graphClusterNames").withIndex("by_owner_signature", (q) => q.eq("ownerId", ownerId)).collect()) await ctx.db.delete(old._id);
    await ctx.db.insert("graphClusterNames", { ownerId, signature, names, at: Date.now() });
  },
});

const NAME_PROMPT = "You label groups in a person's social graph inside Kin, a contacts app. Each group is a community of people they know, found from shared workplaces, cities, interests and group chats. Give each group a short label of one to three words that says what ties it together, like \"Stripe\", \"Climbing\", \"College\", \"Brooklyn neighbors\", \"London fintech\". Sentence case, no emoji, no quotes, no punctuation at the end. Prefer the most specific shared thing: a workplace over a city, a city plus a shared interest over a city alone. Every label must be different. Return one entry per group, using the ids you were given.";

export const nameClusters = action({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<"cached" | "named" | "skipped"> => {
    const input = await ctx.runQuery(internal.graph.clusterInput, { userKey });
    if (input.cached) return "cached";
    if (!input.clusters.length) return "skipped";
    const out = await claude(
      NAME_PROMPT,
      { groups: input.clusters.map((c) => ({ id: c.id, people: c.people })) },
      z.object({ groups: z.array(z.object({ id: z.string(), label: z.string() })) }),
      "graph.nameClusters",
    );
    if (!out) return "skipped";
    const labels = new Map(out.groups.map((g) => [g.id, g.label.trim().slice(0, 28)]));
    const names = input.clusters.map((c) => ({ id: c.id, name: labels.get(c.id) || c.fallback }));
    await ctx.runMutation(internal.graph.saveNames, { ownerId: input.ownerId, signature: input.signature, names });
    return "named";
  },
});
