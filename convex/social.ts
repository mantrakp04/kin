import { action, internalAction, internalMutation, internalQuery, query, type ActionCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { userByKey } from "./lib";
import { socialToolkit } from "./schema";
import { draftFor } from "./assistant";

type Toolkit = "twitter" | "instagram" | "linkedin";
type Relation = "follows" | "followed_by" | "mutual" | "connection";
type EdgeInput = { personId: Id<"people">; otherPersonId?: Id<"people">; otherHandle: string; relation: Relation };
type Mutual = { personId: Id<"people">; name: string; hue: number; via: string; platforms: string[]; relation: Relation; demo: boolean; note?: string };
type ConnectResult = { url: string | null; connected: boolean; error?: string };
type SyncResult = { toolkit: Toolkit; handle?: string; matched: number; edges: number; note?: string; error?: string };
type SyncInput = {
  user: { _id: Id<"users">; key: string; name: string };
  people: Array<{ _id: Id<"people">; name: string; handles: Doc<"people">["handles"]; socialIds: Record<string, string> }>;
};

const TOOLKITS: Toolkit[] = ["twitter", "instagram", "linkedin"];
const LABEL: Record<Toolkit, string> = { twitter: "X", instagram: "Instagram", linkedin: "LinkedIn" };
const HANDLE_KEY = { twitter: "x", instagram: "instagram", linkedin: "linkedin" } as const;
const BASE = "https://backend.composio.dev/api/v3.1";
const LIST_CAP = 2000;
const CONTACT_FANOUT = 30;
const CONTACT_FOLLOWING_CAP = 1000;

const composioUserId = (userKey: string) => `kin_${userKey}`;
const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const first = (name: string) => name.split(" ")[0];
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

async function composio<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set in the Convex environment");
  const method = init?.method ?? "GET";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const err = json?.error;
    const detail = typeof err === "string" ? err : (err?.message ?? text.slice(0, 300));
    throw new Error(`Composio ${res.status} ${method} ${path.split("?")[0]}: ${detail}${err?.suggested_fix ? ` (${err.suggested_fix})` : ""}`);
  }
  return json as T;
}

async function authConfigFor(toolkit: Toolkit): Promise<string> {
  const list = await composio<{ items: Array<{ id: string; status: string; toolkit: { slug: string } }> }>(`/auth_configs?toolkit_slug=${toolkit}`);
  const existing = list.items.find((a) => a.status === "ENABLED" && a.toolkit.slug.toLowerCase() === toolkit);
  if (existing) return existing.id;
  const created = await composio<{ auth_config: { id: string } }>("/auth_configs", {
    method: "POST",
    body: { toolkit: { slug: toolkit }, auth_config: { type: "use_composio_managed_auth" } },
  });
  return created.auth_config.id;
}

type RemoteAccount = { id: string; status: string; toolkit: { slug: string } };

async function remoteAccounts(userKey: string): Promise<RemoteAccount[]> {
  const params = new URLSearchParams({ user_ids: composioUserId(userKey), limit: "100", order_by: "updated_at", order_direction: "desc" });
  const res = await composio<{ items: RemoteAccount[] }>(`/connected_accounts?${params}`);
  return res.items.filter((a) => (TOOLKITS as string[]).includes(a.toolkit.slug.toLowerCase()));
}

type Acct = { connectedAccountId: string; userKey: string };

async function execute(slug: string, acct: Acct, args: Record<string, unknown>): Promise<any> {
  const res = await composio<{ data: any; error: string | null; successful: boolean; log_id?: string }>(`/tools/execute/${slug}`, {
    method: "POST",
    body: { connected_account_id: acct.connectedAccountId, user_id: composioUserId(acct.userKey), arguments: args },
  });
  if (!res.successful) throw new Error(`${slug} failed: ${res.error ?? "unknown error"}${res.log_id ? ` (log ${res.log_id})` : ""}`);
  return res.data;
}

type XUser = { id: string; username: string; name: string };

function xUsers(data: any): XUser[] {
  const d = data?.data ?? data;
  const arr = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(data?.users) ? data.users : [];
  return arr.filter((u: any) => u && typeof u.id === "string" && typeof u.username === "string");
}

const xNext = (data: any): string | undefined => data?.meta?.next_token ?? data?.data?.meta?.next_token;

async function xList(slug: "TWITTER_FOLLOWING_BY_USER_ID" | "TWITTER_FOLLOWERS_BY_USER_ID", acct: Acct, id: string, cap: number) {
  const out: XUser[] = [];
  let token: string | undefined;
  do {
    const data = await execute(slug, acct, { id, max_results: 1000, ...(token ? { pagination_token: token } : {}) });
    out.push(...xUsers(data));
    token = xNext(data);
  } while (token && out.length < cap);
  return out.slice(0, cap);
}

async function refreshAccounts(ctx: ActionCtx, user: { _id: Id<"users">; key: string }) {
  const remote = await remoteAccounts(user.key);
  for (const toolkit of TOOLKITS) {
    const matches = remote.filter((a) => a.toolkit.slug.toLowerCase() === toolkit);
    const best = matches.find((a) => a.status === "ACTIVE") ?? matches[0];
    if (best) await ctx.runMutation(internal.social.upsertAccount, { ownerId: user._id, toolkit, connectedAccountId: best.id, status: best.status });
  }
  return remote.filter((a) => a.status === "ACTIVE").map((a) => a.toolkit.slug.toLowerCase() as Toolkit);
}

export const userForKey = internalQuery({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    return { _id: user._id, key: user.key };
  },
});

export const upsertAccount = internalMutation({
  args: { ownerId: v.id("users"), toolkit: socialToolkit, connectedAccountId: v.string(), status: v.string(), handle: v.optional(v.string()) },
  handler: async (ctx, { ownerId, toolkit, connectedAccountId, status, handle }) => {
    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_owner_toolkit", (q) => q.eq("ownerId", ownerId).eq("toolkit", toolkit))
      .first();
    const at = Date.now();
    if (!existing) return await ctx.db.insert("socialAccounts", { ownerId, toolkit, connectedAccountId, status, handle, at });
    await ctx.db.patch(existing._id, { connectedAccountId, status, at, ...(handle ? { handle } : {}) });
    return existing._id;
  },
});

export const connectLink = action({
  args: { userKey: v.optional(v.string()), toolkit: socialToolkit, redirect: v.optional(v.string()) },
  handler: async (ctx, { userKey, toolkit, redirect }): Promise<ConnectResult> => {
    const user = await ctx.runQuery(internal.social.userForKey, { userKey });
    try {
      const active = (await remoteAccounts(user.key)).find((a) => a.toolkit.slug.toLowerCase() === toolkit && a.status === "ACTIVE");
      if (active) {
        await ctx.runMutation(internal.social.upsertAccount, { ownerId: user._id, toolkit, connectedAccountId: active.id, status: "ACTIVE" });
        await ctx.scheduler.runAfter(0, internal.social.sync, { userId: user._id });
        return { url: null, connected: true };
      }
      const authConfigId = await authConfigFor(toolkit);
      const link = await composio<{ redirect_url: string; connected_account_id: string }>("/connected_accounts/link", {
        method: "POST",
        body: { auth_config_id: authConfigId, user_id: composioUserId(user.key), callback_url: redirect ?? "kin://you" },
      });
      await ctx.runMutation(internal.social.upsertAccount, { ownerId: user._id, toolkit, connectedAccountId: link.connected_account_id, status: "INITIATED" });
      return { url: link.redirect_url, connected: false };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`social.connectLink ${toolkit}: ${error}`);
      return { url: null, connected: false, error };
    }
  },
});

export const refresh = action({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<{ connected: Toolkit[]; error?: string }> => {
    const user = await ctx.runQuery(internal.social.userForKey, { userKey });
    try {
      const connected = await refreshAccounts(ctx, user);
      if (connected.length) await ctx.scheduler.runAfter(0, internal.social.sync, { userId: user._id });
      return { connected };
    } catch (e) {
      return { connected: [], error: e instanceof Error ? e.message : String(e) };
    }
  },
});

export const accounts = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const rows = await ctx.db.query("socialAccounts").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    return TOOLKITS.map((toolkit) => {
      const row = rows.find((r) => r.toolkit === toolkit);
      return { toolkit, connected: row?.status === "ACTIVE", status: row?.status ?? null, handle: row?.handle };
    });
  },
});

export const syncInput = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<SyncInput | null> => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    return {
      user: { _id: user._id, key: user.key, name: user.name },
      people: people.map((p) => ({ _id: p._id, name: p.name, handles: p.handles, socialIds: p.socialIds ?? {} })),
    };
  },
});

export const accountRows = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await ctx.db.query("socialAccounts").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect(),
});

export const saveEdges = internalMutation({
  args: {
    ownerId: v.id("users"),
    toolkit: socialToolkit,
    edges: v.array(
      v.object({
        personId: v.id("people"),
        otherPersonId: v.optional(v.id("people")),
        otherHandle: v.string(),
        relation: v.union(v.literal("follows"), v.literal("followed_by"), v.literal("mutual"), v.literal("connection")),
      }),
    ),
    verified: v.array(v.object({ personId: v.id("people"), platformId: v.string(), handle: v.string() })),
  },
  handler: async (ctx, { ownerId, toolkit, edges, verified }) => {
    const old = (await ctx.db.query("socialEdges").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect()).filter((e) => e.toolkit === toolkit && !e.demo);
    const pairKey = (a: string, b: string) => [a, b].sort().join(":");
    const knownMutual = new Set(old.filter((e) => e.otherPersonId && e.relation === "mutual").map((e) => pairKey(e.personId, e.otherPersonId!)));
    for (const e of old) await ctx.db.delete(e._id);
    const at = Date.now();
    for (const e of edges) await ctx.db.insert("socialEdges", { ownerId, toolkit, ...e, at });

    const key = HANDLE_KEY[toolkit];
    for (const { personId, platformId, handle } of verified) {
      const p = await ctx.db.get(personId);
      if (!p) continue;
      await ctx.db.patch(personId, {
        socialIds: { ...(p.socialIds ?? {}), [toolkit]: platformId },
        handlesVerified: Array.from(new Set([...(p.handlesVerified ?? []), key])),
        handles: p.handles[key] ? p.handles : { ...p.handles, [key]: handle },
      });
    }

    const owner = await ctx.db.get(ownerId);
    const noted = new Set<string>();
    for (const e of edges) {
      if (!e.otherPersonId || e.relation !== "mutual") continue;
      const k = pairKey(e.personId, e.otherPersonId);
      if (knownMutual.has(k) || noted.has(k)) continue;
      noted.add(k);
      const [a, b] = await Promise.all([ctx.db.get(e.personId), ctx.db.get(e.otherPersonId)]);
      if (!a || !b) continue;
      const content = `${day(at)}: ${a.name} and ${b.name} follow each other on ${LABEL[toolkit]} (seen from ${owner?.name ?? "the user"}'s connected ${LABEL[toolkit]} account).`;
      const metadata = { type: "social", toolkit, date: day(at) };
      for (const p of [a, b]) {
        await ctx.scheduler.runAfter(0, internal.memory.rememberNote, { personId: p._id, id: `social_${toolkit}_${k}`, content, metadata });
      }
    }
    return { edges: edges.length, newMutuals: noted.size };
  },
});

async function syncTwitter(ctx: ActionCtx, input: SyncInput, acct: Acct): Promise<SyncResult> {
  const meData = await execute("TWITTER_USER_LOOKUP_ME", acct, {});
  const me = (meData?.data ?? meData) as Partial<XUser>;
  if (!me?.id || !me.username) throw new Error("TWITTER_USER_LOOKUP_ME returned no user id");
  const myId = me.id;
  const myHandle = me.username;
  await ctx.runMutation(internal.social.upsertAccount, { ownerId: input.user._id, toolkit: "twitter", connectedAccountId: acct.connectedAccountId, status: "ACTIVE", handle: myHandle });

  const byHandle = new Map<string, Id<"people">>();
  const byXId = new Map<string, Id<"people">>();
  const nameCount = new Map<string, number>();
  const byName = new Map<string, Id<"people">>();
  for (const p of input.people) {
    if (p.handles.x) byHandle.set(p.handles.x.replace(/^@/, "").toLowerCase(), p._id);
    if (p.socialIds.twitter) byXId.set(p.socialIds.twitter, p._id);
    const n = norm(p.name);
    nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
    byName.set(n, p._id);
  }
  const match = (u: XUser) => byXId.get(u.id) ?? byHandle.get(u.username.toLowerCase()) ?? (nameCount.get(norm(u.name)) === 1 ? byName.get(norm(u.name)) : undefined);

  const [following, followers] = await Promise.all([
    xList("TWITTER_FOLLOWING_BY_USER_ID", acct, myId, LIST_CAP),
    xList("TWITTER_FOLLOWERS_BY_USER_ID", acct, myId, LIST_CAP),
  ]);
  const matched = new Map<Id<"people">, { user: XUser; follows: boolean; followedBy: boolean }>();
  for (const u of following) {
    const id = match(u);
    if (id) matched.set(id, { user: u, follows: true, followedBy: false });
  }
  for (const u of followers) {
    const id = match(u);
    if (!id) continue;
    const prev = matched.get(id);
    matched.set(id, { user: prev?.user ?? u, follows: prev?.follows ?? false, followedBy: true });
  }

  const edges: EdgeInput[] = [];
  const verified: Array<{ personId: Id<"people">; platformId: string; handle: string }> = [];
  for (const [personId, m] of matched) {
    edges.push({ personId, otherHandle: myHandle, relation: m.follows && m.followedBy ? "mutual" : m.follows ? "follows" : "followed_by" });
    verified.push({ personId, platformId: m.user.id, handle: m.user.username });
    byXId.set(m.user.id, personId);
  }

  const follows = new Map<Id<"people">, Map<Id<"people">, string>>();
  let note: string | undefined;
  for (const [personId, m] of Array.from(matched).slice(0, CONTACT_FANOUT)) {
    try {
      const theirs = await xList("TWITTER_FOLLOWING_BY_USER_ID", acct, m.user.id, CONTACT_FOLLOWING_CAP);
      const targets = new Map<Id<"people">, string>();
      for (const u of theirs) {
        const other = match(u);
        if (other && other !== personId) targets.set(other, u.username);
      }
      follows.set(personId, targets);
    } catch (e) {
      note = `Some contacts' following lists were not readable: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
    }
  }
  for (const [a, targets] of follows) {
    for (const [b, handle] of targets) {
      edges.push({ personId: a, otherPersonId: b, otherHandle: handle, relation: follows.get(b)?.has(a) ? "mutual" : "follows" });
    }
  }

  const saved: { edges: number } = await ctx.runMutation(internal.social.saveEdges, { ownerId: input.user._id, toolkit: "twitter", edges, verified });
  return { toolkit: "twitter", handle: myHandle, matched: matched.size, edges: saved.edges, note };
}

async function syncProfileOnly(ctx: ActionCtx, input: SyncInput, acct: Acct, toolkit: "instagram" | "linkedin"): Promise<SyncResult> {
  const data =
    toolkit === "instagram"
      ? await execute("INSTAGRAM_GET_USER_INFO", acct, { ig_user_id: "me", fields: "id,username,name,account_type" })
      : await execute("LINKEDIN_GET_MY_INFO", acct, {});
  const d = data?.data ?? data;
  const fullName = [d?.localizedFirstName ?? d?.given_name, d?.localizedLastName ?? d?.family_name].filter(Boolean).join(" ");
  const handle: string | undefined = toolkit === "instagram" ? d?.username : (d?.vanityName ?? (fullName || d?.name));
  await ctx.runMutation(internal.social.upsertAccount, { ownerId: input.user._id, toolkit, connectedAccountId: acct.connectedAccountId, status: "ACTIVE", handle });
  const note =
    toolkit === "instagram"
      ? "Instagram's API (Business/Creator accounts only) returns follower counts, not follower lists, so no contact edges are read."
      : "LinkedIn's API returns your own profile and lets you post; it does not expose your connections list.";
  return { toolkit, handle, matched: 0, edges: 0, note };
}

export const sync = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<SyncResult[]> => {
    const input: SyncInput | null = await ctx.runQuery(internal.social.syncInput, { userId });
    if (!input) return [];
    await refreshAccounts(ctx, input.user);
    const rows: Array<Doc<"socialAccounts">> = await ctx.runQuery(internal.social.accountRows, { userId });
    const results: SyncResult[] = [];
    for (const row of rows.filter((r) => r.status === "ACTIVE")) {
      const acct = { connectedAccountId: row.connectedAccountId, userKey: input.user.key };
      try {
        results.push(row.toolkit === "twitter" ? await syncTwitter(ctx, input, acct) : await syncProfileOnly(ctx, input, acct, row.toolkit));
      } catch (e) {
        results.push({ toolkit: row.toolkit, matched: 0, edges: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }
    console.log(`social.sync ${input.user.key}: ${JSON.stringify(results)}`);
    return results;
  },
});

export const usersToSync = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users">[]> => {
    const rows = await ctx.db.query("socialAccounts").collect();
    return Array.from(new Set(rows.filter((r) => r.status === "ACTIVE").map((r) => r.ownerId)));
  },
});

export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const ids: Id<"users">[] = await ctx.runQuery(internal.social.usersToSync, {});
    for (const [i, userId] of ids.entries()) await ctx.scheduler.runAfter(i * 60_000, internal.social.sync, { userId });
    return ids.length;
  },
});

async function mutualsOf(ctx: QueryCtx, personId: Id<"people">): Promise<Mutual[]> {
  const [out, inbound] = await Promise.all([
    ctx.db.query("socialEdges").withIndex("by_person", (q) => q.eq("personId", personId)).collect(),
    ctx.db.query("socialEdges").withIndex("by_other", (q) => q.eq("otherPersonId", personId)).collect(),
  ]);
  type Acc = { platforms: Set<Toolkit>; mutual: boolean; connection: boolean; follows: boolean; followedBy: boolean; demo: boolean };
  const acc = new Map<Id<"people">, Acc>();
  const add = (id: Id<"people">, e: Doc<"socialEdges">, outbound: boolean) => {
    let m = acc.get(id);
    if (!m) acc.set(id, (m = { platforms: new Set(), mutual: false, connection: false, follows: false, followedBy: false, demo: true }));
    m.platforms.add(e.toolkit);
    m.demo = m.demo && !!e.demo;
    if (e.relation === "mutual") m.mutual = true;
    else if (e.relation === "connection") m.connection = true;
    else if ((e.relation === "follows") === outbound) m.follows = true;
    else m.followedBy = true;
  };
  for (const e of out) if (e.otherPersonId && e.otherPersonId !== personId) add(e.otherPersonId, e, true);
  for (const e of inbound) if (e.personId !== personId) add(e.personId, e, false);

  const result: Mutual[] = [];
  for (const [id, m] of acc) {
    const p = await ctx.db.get(id);
    if (!p) continue;
    const platforms = TOOLKITS.filter((t) => m.platforms.has(t)).map((t) => LABEL[t]);
    const relation: Relation = m.mutual || (m.follows && m.followedBy) ? "mutual" : m.connection ? "connection" : m.follows ? "follows" : "followed_by";
    result.push({ personId: id, name: p.name, hue: p.hue, via: platforms.join(", "), platforms, relation, demo: m.demo });
  }
  const chatEdges = [
    ...(await ctx.db.query("chatEdges").withIndex("by_person", (q) => q.eq("personId", personId)).collect()).map((e) => ({ id: e.otherPersonId, groups: e.groups })),
    ...(await ctx.db.query("chatEdges").withIndex("by_other", (q) => q.eq("otherPersonId", personId)).collect()).map((e) => ({ id: e.personId, groups: e.groups })),
  ];
  for (const e of chatEdges) {
    const note = e.groups === 1 ? "In a group chat together" : `In ${e.groups} group chats together`;
    const existing = result.find((m) => m.personId === e.id);
    if (existing) {
      existing.note = note;
      continue;
    }
    const p = await ctx.db.get(e.id);
    if (p) result.push({ personId: e.id, name: p.name, hue: p.hue, via: note, platforms: [], relation: "connection", demo: false, note });
  }
  const rank: Record<Relation, number> = { mutual: 0, connection: 1, follows: 2, followed_by: 3 };
  return result.sort((a, b) => rank[a.relation] - rank[b.relation] || a.name.localeCompare(b.name));
}

export const mutuals = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => (await mutualsOf(ctx, personId)).map(({ personId, name, via, relation, note }) => ({ personId, name, via: note && via !== note ? `${via}; ${note}` : via, relation })),
});

export const mutualsFor = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => await mutualsOf(ctx, personId),
});

export const dmInput = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const p = await ctx.db.get(personId);
    if (!p) return null;
    const owner = await ctx.db.get(p.ownerId);
    return { name: p.name, handles: p.handles, socialIds: p.socialIds ?? {}, ownerKey: owner?.key };
  },
});

export const draftDm = internalAction({
  args: { personId: v.id("people"), text: v.optional(v.string()), toolkit: v.optional(socialToolkit) },
  handler: async (ctx, { personId, text, toolkit }): Promise<{ toolkit: Toolkit; url?: string; draft: string }> => {
    const p = await ctx.runQuery(internal.social.dmInput, { personId });
    if (!p) throw new Error("Person not found");
    const chosen: Toolkit = toolkit ?? TOOLKITS.find((t) => p.handles[HANDLE_KEY[t]] || p.socialIds[t]) ?? "twitter";
    const draft =
      text?.trim() ||
      (await draftFor(ctx, p.ownerKey, personId, `A short, warm hello sent as a ${LABEL[chosen]} direct message.`))[0] ||
      `Hey ${first(p.name)}, been thinking of you. How are things?`;
    const handle = p.handles[HANDLE_KEY[chosen]]?.replace(/^@/, "");
    const xId = p.socialIds.twitter;
    let url: string | undefined;
    if (chosen === "twitter") url = xId ? `https://x.com/messages/compose?recipient_id=${xId}&text=${encodeURIComponent(draft)}` : handle ? `https://x.com/${handle}` : undefined;
    else if (chosen === "instagram") url = handle ? `https://ig.me/m/${handle}` : "https://www.instagram.com/direct/inbox/";
    else url = handle ? `https://www.linkedin.com/in/${handle}` : undefined;
    return { toolkit: chosen, url, draft };
  },
});

const DEMO_EDGES: Array<{ a: string; b: string; toolkit: Toolkit; relation: Relation }> = [
  { a: "arjun", b: "leo", toolkit: "twitter", relation: "mutual" },
  { a: "sofia", b: "maya", toolkit: "instagram", relation: "mutual" },
  { a: "priya", b: "arjun", toolkit: "linkedin", relation: "connection" },
  { a: "leo", b: "daniel", toolkit: "twitter", relation: "mutual" },
  { a: "hannah", b: "olivia", toolkit: "twitter", relation: "mutual" },
  { a: "sofia", b: "marcus", toolkit: "instagram", relation: "mutual" },
  { a: "nina", b: "julia", toolkit: "instagram", relation: "mutual" },
  { a: "ben", b: "priya", toolkit: "instagram", relation: "mutual" },
  { a: "emma", b: "olivia", toolkit: "linkedin", relation: "connection" },
  { a: "leo", b: "maya", toolkit: "linkedin", relation: "connection" },
  { a: "arjun", b: "sofia", toolkit: "twitter", relation: "follows" },
  { a: "olivia", b: "arjun", toolkit: "twitter", relation: "follows" },
];

export const seedDemoEdges = internalMutation({
  args: { userKey: v.optional(v.string()), clear: v.optional(v.boolean()) },
  handler: async (ctx, { userKey, clear }) => {
    const user = await userByKey(ctx, userKey);
    const old = (await ctx.db.query("socialEdges").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect()).filter((e) => e.demo);
    for (const e of old) await ctx.db.delete(e._id);
    if (clear) return { removed: old.length, added: 0, skipped: [] as string[] };
    const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const byKey = new Map(people.map((p) => [p.key, p]));
    const handle = (p: Doc<"people">, toolkit: Toolkit) => p.handles[HANDLE_KEY[toolkit]] ?? p.key;
    const at = Date.now();
    let added = 0;
    const skipped: string[] = [];
    for (const { a, b, toolkit, relation } of DEMO_EDGES) {
      const pa = byKey.get(a);
      const pb = byKey.get(b);
      if (!pa || !pb) {
        skipped.push(`${a}-${b}`);
        continue;
      }
      await ctx.db.insert("socialEdges", { ownerId: user._id, personId: pa._id, otherPersonId: pb._id, otherHandle: handle(pb, toolkit), toolkit, relation, demo: true, at });
      added++;
      if (relation !== "mutual") continue;
      await ctx.db.insert("socialEdges", { ownerId: user._id, personId: pb._id, otherPersonId: pa._id, otherHandle: handle(pa, toolkit), toolkit, relation, demo: true, at });
      added++;
    }
    return { removed: old.length, added, skipped };
  },
});
