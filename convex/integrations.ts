import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { userByKey } from "./lib";

// Composio is the integrations layer for the shared Kin agent. Users connect calendars (and optional
// read-only context apps) from the "Your agent" screen; Kin stores only the Composio connected account id,
// its status and whether the agent may use it. Credentials stay with Composio.

const BASE = "https://backend.composio.dev/api/v3.1";
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const MEETING_MINUTES = 30;

export type Kind = "calendar" | "context";
export const CATALOG: Record<string, { label: string; kind: Kind; detail: string }> = {
  googlecalendar: { label: "Google Calendar", kind: "calendar", detail: "Free/busy and new events" },
  outlook: { label: "Outlook Calendar", kind: "calendar", detail: "Free/busy and new events" },
  cal: { label: "Cal.com", kind: "calendar", detail: "Your event type's open slots and bookings" },
  calendly: { label: "Calendly", kind: "calendar", detail: "Your event type's open times and bookings" },
  github: { label: "GitHub", kind: "context", detail: "Public repositories you pushed to recently" },
  notion: { label: "Notion", kind: "context", detail: "Titles of pages you edited recently" },
};
const CALENDAR_ORDER = ["cal", "calendly", "googlecalendar", "outlook"];

export type Slot = { start: string; label: string };
export type Conn = { toolkit: string; connectedAccountId: string; userKey: string };
export type Availability = { source: string; demo: boolean; slots: Slot[]; note?: string };

const composioUserId = (userKey: string) => "kin_" + userKey;

async function composio<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  const method = init?.method ?? "GET";
  const res = await fetch(BASE + path, { method, headers: { "x-api-key": key, "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) throw new Error("Composio " + res.status + " " + path.split("?")[0] + ": " + (json?.error?.message ?? json?.error ?? text.slice(0, 200)));
  return json as T;
}

async function run(slug: string, conn: Conn, args: Record<string, unknown>): Promise<any> {
  const res = await composio<{ data: any; error: string | null; successful: boolean }>("/tools/execute/" + slug, {
    method: "POST",
    body: { connected_account_id: conn.connectedAccountId, user_id: composioUserId(conn.userKey), arguments: args },
  });
  if (!res.successful) throw new Error(slug + " failed: " + (res.error ?? "unknown error"));
  return res.data;
}

async function authConfigFor(toolkit: string): Promise<string> {
  const list = await composio<{ items: Array<{ id: string; status: string; toolkit: { slug: string } }> }>("/auth_configs?toolkit_slug=" + toolkit);
  const existing = list.items.find((a) => a.status === "ENABLED" && a.toolkit.slug.toLowerCase() === toolkit);
  if (existing) return existing.id;
  const created = await composio<{ auth_config: { id: string } }>("/auth_configs", { method: "POST", body: { toolkit: { slug: toolkit }, auth_config: { type: "use_composio_managed_auth" } } });
  return created.auth_config.id;
}

async function remoteAccounts(userKey: string) {
  const params = new URLSearchParams({ user_ids: composioUserId(userKey), limit: "100", order_by: "updated_at", order_direction: "desc" });
  const res = await composio<{ items: Array<{ id: string; status: string; toolkit: { slug: string } }> }>("/connected_accounts?" + params);
  return res.items.filter((a) => a.toolkit.slug.toLowerCase() in CATALOG);
}

export const owner = internalQuery({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    return { _id: user._id, key: user.key };
  },
});

export const upsert = internalMutation({
  args: { ownerId: v.id("users"), toolkit: v.string(), connectedAccountId: v.string(), status: v.string() },
  handler: async (ctx, { ownerId, toolkit, connectedAccountId, status }) => {
    const row = await ctx.db.query("agentConnections").withIndex("by_owner_toolkit", (q) => q.eq("ownerId", ownerId).eq("toolkit", toolkit)).first();
    if (row) await ctx.db.patch(row._id, { connectedAccountId, status, at: Date.now() });
    else await ctx.db.insert("agentConnections", { ownerId, toolkit, connectedAccountId, status, enabled: CATALOG[toolkit]?.kind === "calendar", at: Date.now() });
  },
});

export const connectLink = action({
  args: { userKey: v.optional(v.string()), toolkit: v.string(), redirect: v.optional(v.string()) },
  handler: async (ctx, { userKey, toolkit, redirect }): Promise<{ url: string | null; connected: boolean; error?: string }> => {
    if (!(toolkit in CATALOG)) return { url: null, connected: false, error: "Unknown app" };
    const user = await ctx.runQuery(internal.integrations.owner, { userKey });
    try {
      const active = (await remoteAccounts(user.key)).find((a) => a.toolkit.slug.toLowerCase() === toolkit && a.status === "ACTIVE");
      if (active) {
        await ctx.runMutation(internal.integrations.upsert, { ownerId: user._id, toolkit, connectedAccountId: active.id, status: "ACTIVE" });
        return { url: null, connected: true };
      }
      const link = await composio<{ redirect_url: string; connected_account_id: string }>("/connected_accounts/link", {
        method: "POST",
        body: { auth_config_id: await authConfigFor(toolkit), user_id: composioUserId(user.key), callback_url: redirect ?? "kin://agent" },
      });
      await ctx.runMutation(internal.integrations.upsert, { ownerId: user._id, toolkit, connectedAccountId: link.connected_account_id, status: "INITIATED" });
      return { url: link.redirect_url, connected: false };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log("integrations.connectLink " + toolkit + ": " + error);
      return { url: null, connected: false, error };
    }
  },
});

export const refresh = action({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<{ connected: string[]; error?: string }> => {
    const user = await ctx.runQuery(internal.integrations.owner, { userKey });
    try {
      const remote = await remoteAccounts(user.key);
      for (const toolkit of Object.keys(CATALOG)) {
        const matches = remote.filter((a) => a.toolkit.slug.toLowerCase() === toolkit);
        const best = matches.find((a) => a.status === "ACTIVE") ?? matches[0];
        if (best) await ctx.runMutation(internal.integrations.upsert, { ownerId: user._id, toolkit, connectedAccountId: best.id, status: best.status });
      }
      return { connected: remote.filter((a) => a.status === "ACTIVE").map((a) => a.toolkit.slug.toLowerCase()) };
    } catch (e) {
      return { connected: [], error: e instanceof Error ? e.message : String(e) };
    }
  },
});

export const connections = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }) => {
    const user = await userByKey(ctx, userKey);
    const rows = await ctx.db.query("agentConnections").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    return Object.entries(CATALOG).map(([toolkit, meta]) => {
      const row = rows.find((r) => r.toolkit === toolkit);
      return { toolkit, ...meta, status: row?.status ?? null, connected: row?.status === "ACTIVE", enabled: row?.enabled ?? false };
    });
  },
});

export const setEnabled = mutation({
  args: { userKey: v.optional(v.string()), toolkit: v.string(), enabled: v.boolean() },
  handler: async (ctx, { userKey, toolkit, enabled }) => {
    const user = await userByKey(ctx, userKey);
    const row = await ctx.db.query("agentConnections").withIndex("by_owner_toolkit", (q) => q.eq("ownerId", user._id).eq("toolkit", toolkit)).first();
    if (!row) throw new Error("Connect " + (CATALOG[toolkit]?.label ?? toolkit) + " first");
    await ctx.db.patch(row._id, { enabled });
  },
});

export const enabledFor = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }): Promise<Conn[]> => {
    const user = await ctx.db.get(ownerId);
    if (!user) return [];
    const rows = await ctx.db.query("agentConnections").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return rows.filter((r) => r.enabled && r.status === "ACTIVE").map((r) => ({ toolkit: r.toolkit, connectedAccountId: r.connectedAccountId, userKey: user.key }));
  },
});

export const calendarOf = (conns: Conn[]) => CALENDAR_ORDER.map((t) => conns.find((c) => c.toolkit === t)).find(Boolean) ?? null;
export const contextOf = (conns: Conn[]) => conns.filter((c) => CATALOG[c.toolkit]?.kind === "context");

export function slotLabel(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" });
}

function tzOffset(at: number, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at / 1000) * 1000;
}

export function zoned(y: number, m: number, d: number, hh: number, mm: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return guess - tzOffset(guess - tzOffset(guess, tz), tz);
}

export function localIso(iso: string, tz: string) {
  const at = new Date(iso).getTime();
  return new Date(at + tzOffset(at, tz)).toISOString().slice(0, 19);
}

function grid(tz: string, from: number, to: number, hours: Array<[number, number]>) {
  const out: number[] = [];
  const earliest = Date.now() + 2 * 60 * MINUTE;
  for (let at = from; at <= to; at += DAY) {
    const [m, d, y] = new Date(at).toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).split("/").map(Number);
    const weekday = new Date(at).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
    if (weekday === "Sat" || weekday === "Sun") continue;
    for (const [hh, mm] of hours) {
      const start = zoned(y, m, d, hh, mm, tz);
      if (start >= earliest && start <= to) out.push(start);
    }
  }
  return out;
}

function spread(all: string[], perDay = 3, max = 9) {
  const byDay = new Map<string, string[]>();
  for (const s of [...new Set(all)].sort()) byDay.set(s.slice(0, 10), [...(byDay.get(s.slice(0, 10)) ?? []), s]);
  const out: string[] = [];
  for (const list of byDay.values()) {
    const n = Math.min(perDay, list.length);
    for (let k = 0; k < n && out.length < max; k++) out.push(list[Math.floor((k * list.length) / n)]);
  }
  return out;
}

// DEMO SCHEDULE: used only when the owner has no calendar connected (or the calendar call fails).
// Weekday slots at fixed times in the owner's time zone, with a deterministic subset removed so it reads like a real week.
function demoSlots(tz: string, from: number, to: number, taken: string[]) {
  return grid(tz, from, to, [[10, 0], [11, 30], [14, 0], [15, 0], [16, 30]])
    .filter((at) => Math.floor(at / (90 * MINUTE)) % 3 !== 0)
    .map((at) => new Date(at).toISOString())
    .filter((iso) => !taken.includes(iso));
}

const WORK_HOURS: Array<[number, number]> = [[9, 30], [10, 0], [10, 30], [11, 0], [11, 30], [13, 0], [13, 30], [14, 0], [14, 30], [15, 0], [15, 30], [16, 0], [16, 30], [17, 0]];

function busyFrom(data: unknown): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const time = (x: any) => {
    if (typeof x === "string") return Date.parse(x);
    if (x && typeof x.dateTime === "string") return Date.parse(/Z|[+-]\d\d:?\d\d$/.test(x.dateTime) || x.timeZone !== "UTC" ? x.dateTime : x.dateTime + "Z");
    return NaN;
  };
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if ("start" in node && "end" in node && node.status !== "free") {
      const s = time(node.start);
      const e = time(node.end);
      if (!Number.isNaN(s) && !Number.isNaN(e)) out.push([s, e]);
    }
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  walk(data, 0);
  return out;
}

const freeOf = (tz: string, from: number, to: number, busy: Array<[number, number]>) =>
  grid(tz, from, to, WORK_HOURS)
    .filter((s) => !busy.some(([bs, be]) => s < be && s + MEETING_MINUTES * MINUTE > bs))
    .map((s) => new Date(s).toISOString());

async function calEventTypeId(conn: Conn): Promise<number> {
  const data = await run("CAL_LIST_EVENT_TYPES", conn, {});
  const list: any[] = data?.data ?? data?.event_types ?? data?.response_data?.data ?? [];
  const pick = list.find((e) => !e.hidden) ?? list[0];
  if (!pick?.id) throw new Error("No Cal.com event type");
  return Number(pick.id);
}

async function calendlyEventType(conn: Conn): Promise<{ uri: string; schedulingUrl?: string; location?: string }> {
  const me = await run("CALENDLY_GET_CURRENT_USER", conn, {});
  const user = me?.resource?.uri ?? me?.data?.resource?.uri ?? me?.uri;
  const types = await run("CALENDLY_LIST_USER_S_EVENT_TYPES", conn, { user, active: true, count: 20 });
  const list: any[] = types?.collection ?? types?.data?.collection ?? [];
  const pick = list[0];
  if (!pick?.uri) throw new Error("No Calendly event type");
  return { uri: pick.uri, schedulingUrl: pick.scheduling_url, location: pick.locations?.[0]?.kind };
}

async function outlookEmail(conn: Conn): Promise<string> {
  const p = await run("OUTLOOK_GET_PROFILE", conn, { user_id: "me" });
  const email = p?.mail ?? p?.userPrincipalName ?? p?.data?.mail ?? p?.response_data?.mail;
  if (!email) throw new Error("No Outlook address");
  return email;
}

async function calendarSlots(conn: Conn, tz: string, from: number, to: number): Promise<string[]> {
  const timeMin = new Date(from).toISOString();
  const timeMax = new Date(to).toISOString();
  switch (conn.toolkit) {
    case "googlecalendar":
      return freeOf(tz, from, to, busyFrom(await run("GOOGLECALENDAR_FREE_BUSY_QUERY", conn, { items: ["primary"], timeMin, timeMax, timeZone: "UTC" })));
    case "outlook": {
      const email = await outlookEmail(conn);
      const data = await run("OUTLOOK_GET_SCHEDULE", conn, { schedules: [email], startTime: { dateTime: timeMin.slice(0, 19), timeZone: "UTC" }, endTime: { dateTime: timeMax.slice(0, 19), timeZone: "UTC" } });
      return freeOf(tz, from, to, busyFrom(data));
    }
    case "cal": {
      const data = await run("CAL_GET_AVAILABLE_SLOTS_INFO", conn, { eventTypeId: await calEventTypeId(conn), startTime: timeMin, endTime: timeMax, timeZone: "UTC" });
      const days = data?.data ?? data?.slots ?? data;
      return Object.values(days && typeof days === "object" ? days : {})
        .flat()
        .map((s: any) => (typeof s === "string" ? s : s?.start ?? s?.time))
        .filter((s): s is string => typeof s === "string")
        .map((s) => new Date(s).toISOString());
    }
    case "calendly": {
      const type = await calendlyEventType(conn);
      const end = Math.min(to, from + 7 * DAY - MINUTE);
      const data = await run("CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES", conn, { event_type: type.uri, start_time: new Date(Math.max(from, Date.now() + 5 * MINUTE)).toISOString(), end_time: new Date(end).toISOString() });
      const list: any[] = data?.collection ?? data?.data?.collection ?? [];
      return list.filter((s) => s.status !== "unavailable").map((s) => new Date(s.start_time).toISOString());
    }
  }
  throw new Error("Not a calendar: " + conn.toolkit);
}

export async function availability(conns: Conn[], tz: string, from: number, to: number, labelTz: string, taken: string[]): Promise<Availability> {
  const label = (list: string[]) => list.map((start) => ({ start, label: slotLabel(start, labelTz) }));
  const demo = (note: string): Availability => ({ source: "demo", demo: true, slots: label(spread(demoSlots(tz, from, to, taken))), note });
  const conn = calendarOf(conns);
  if (!conn) return demo("Demo schedule: no calendar is connected yet.");
  try {
    return { source: CATALOG[conn.toolkit].label, demo: false, slots: label(spread((await calendarSlots(conn, tz, from, to)).filter((s) => !taken.includes(s)))) };
  } catch (e) {
    console.log("integrations.availability " + conn.toolkit + ":", e instanceof Error ? e.message : e);
    return demo("Demo schedule: " + CATALOG[conn.toolkit].label + " did not answer.");
  }
}

export type BookInput = { start: string; name: string; email: string; timeZone: string; ownerTz: string; ownerName: string; note?: string };
export type BookResult = { ok: true; toolkit: string; ref: string } | { ok: false; error: string; schedulingUrl?: string };

export async function book(conns: Conn[], input: BookInput): Promise<BookResult> {
  const conn = calendarOf(conns);
  if (!conn) return { ok: false, error: "no_calendar" };
  const start = new Date(input.start);
  const end = new Date(start.getTime() + MEETING_MINUTES * MINUTE);
  const title = input.ownerName.split(" ")[0] + " and " + input.name;
  const description = "Booked by " + input.ownerName.split(" ")[0] + "'s Kin agent." + (input.note ? "\n\n" + input.note.slice(0, 500) : "");
  try {
    switch (conn.toolkit) {
      case "googlecalendar": {
        const data = await run("GOOGLECALENDAR_CREATE_EVENT", conn, {
          calendar_id: "primary",
          summary: title,
          description,
          start_datetime: localIso(start.toISOString(), input.ownerTz),
          timezone: input.ownerTz,
          event_duration_hour: 0,
          event_duration_minutes: MEETING_MINUTES,
          attendees: [input.email],
          send_updates: "all",
        });
        return { ok: true, toolkit: conn.toolkit, ref: String(data?.id ?? data?.response_data?.id ?? "") };
      }
      case "outlook": {
        const data = await run("OUTLOOK_CALENDAR_CREATE_EVENT", conn, {
          subject: title,
          body: description,
          start_datetime: localIso(start.toISOString(), input.ownerTz),
          end_datetime: localIso(end.toISOString(), input.ownerTz),
          time_zone: input.ownerTz,
          attendees_info: [input.email],
        });
        return { ok: true, toolkit: conn.toolkit, ref: String(data?.id ?? data?.response_data?.id ?? "") };
      }
      case "cal": {
        const data = await run("CAL_POST_NEW_BOOKING_REQUEST", conn, {
          start: start.toISOString(),
          eventTypeId: await calEventTypeId(conn),
          language: "en",
          timeZone: input.timeZone,
          responses: { name: input.name, email: input.email, ...(input.note ? { notes: input.note.slice(0, 500) } : {}) },
          metadata: { source: "kin-agent" },
        });
        return { ok: true, toolkit: conn.toolkit, ref: String(data?.data?.uid ?? data?.uid ?? "") };
      }
      case "calendly": {
        const type = await calendlyEventType(conn);
        try {
          const data = await run("CALENDLY_CREATE_EVENT_INVITEE", conn, {
            event_type: type.uri,
            start_time: start.toISOString(),
            invitee: { name: input.name, email: input.email, timezone: input.timeZone },
            location: { kind: type.location ?? "ask_invitee", ...(type.location ? {} : { location: "To be confirmed" }) },
          });
          return { ok: true, toolkit: conn.toolkit, ref: String(data?.resource?.uri ?? data?.uri ?? "") };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e), schedulingUrl: type.schedulingUrl };
        }
      }
    }
    return { ok: false, error: "unsupported" };
  } catch (e) {
    console.log("integrations.book " + conn.toolkit + ":", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function recentWork(conns: Conn[]) {
  const out: Array<{ source: string; items: Array<Record<string, string>> }> = [];
  for (const conn of contextOf(conns)) {
    try {
      if (conn.toolkit === "github") {
        const data = await run("GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", conn, { sort: "pushed", direction: "desc", per_page: 20, type: "owner" });
        const repos: any[] = Array.isArray(data) ? data : (data?.repositories ?? data?.details ?? data?.data ?? []);
        out.push({
          source: "GitHub",
          items: repos
            .filter((r) => r && r.private === false && !r.fork)
            .slice(0, 6)
            .map((r) => ({ name: String(r.name), description: String(r.description ?? ""), language: String(r.language ?? ""), pushed: String(r.pushed_at ?? "").slice(0, 10) })),
        });
      }
      if (conn.toolkit === "notion") {
        const data = await run("NOTION_SEARCH_NOTION_PAGE", conn, { query: "", page_size: 8, filter_value: "page", filter_property: "object", timestamp: "last_edited_time", direction: "descending" });
        const pages: any[] = data?.results ?? data?.response_data?.results ?? [];
        const title = (p: any) => {
          const prop = Object.values(p?.properties ?? {}).find((x: any) => x?.type === "title") as any;
          return (prop?.title ?? []).map((t: any) => t?.plain_text ?? "").join("");
        };
        out.push({ source: "Notion", items: pages.map((p) => ({ title: title(p), edited: String(p.last_edited_time ?? "").slice(0, 10) })).filter((p) => p.title).slice(0, 6) });
      }
    } catch (e) {
      console.log("integrations.recentWork " + conn.toolkit + ":", e instanceof Error ? e.message : e);
    }
  }
  return out;
}

