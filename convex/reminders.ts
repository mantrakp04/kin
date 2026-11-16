import { action, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { DAY, userByKey } from "./lib";

const HOUR = 60 * 60 * 1000;
export const DEFAULT_TZ = "America/New_York";

type Planned = {
  personId?: Id<"people">;
  kind: Doc<"reminders">["kind"];
  title: string;
  body: string;
  fireAt: number;
  channel: Doc<"reminders">["channel"];
  sourceId: string;
};

type PlannedView = { user: string; kind: string; title: string; body: string; fireAt: string; person: string | null };

export type ReminderRow = {
  _id: Id<"reminders">;
  kind: Doc<"reminders">["kind"];
  title: string;
  body: string;
  fireAt: number;
  status: Doc<"reminders">["status"];
  channel: Doc<"reminders">["channel"];
  createdBy: Doc<"reminders">["createdBy"];
  person: { _id: Id<"people">; name: string; hue: number } | null;
};

function zoned(at: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, min: get("minute") };
}

function localTime(y: number, m: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const offsetAt = (at: number) => {
    const z = zoned(at, tz);
    return Date.UTC(z.y, z.m - 1, z.d, z.h, z.min) - at;
  };
  return guess - offsetAt(guess - offsetAt(guess));
}

function clock(at: number, tz: string) {
  const z = zoned(at, tz);
  return `${z.h % 12 || 12}${z.min ? `:${String(z.min).padStart(2, "0")}` : ""} ${z.h < 12 ? "am" : "pm"}`;
}

function longDate(at: number, tz: string, now: number) {
  const sameYear = zoned(at, tz).y === zoned(now, tz).y;
  return new Date(at).toLocaleDateString("en-US", { timeZone: tz, month: "long", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function daytime(at: number, tz: string) {
  const z = zoned(at, tz);
  if (z.h < 9) return localTime(z.y, z.m, z.d, 9, 0, tz);
  if (z.h >= 21) return localTime(z.y, z.m, z.d + 1, 9, 0, tz);
  return at;
}

const firstName = (name: string) => name.split(" ")[0];
const sentence = (text: string) => text.trim().replace(/[.!]+$/, "");

function eventTitle(text: string) {
  const hosting = sentence(text).match(/^(?:Hosting|Throwing|Running) (.+) for (.+)$/i);
  return hosting ? `${hosting[2]} ${hosting[1]}` : sentence(text);
}

async function planFor(ctx: MutationCtx, user: Doc<"users">, now: number) {
  const tz = user.tz ?? DEFAULT_TZ;
  const created: Array<Planned & { person: string | null }> = [];
  const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
  const byId = new Map(people.map((p) => [p._id, p]));
  const bySource = (sourceId: string) =>
    ctx.db
      .query("reminders")
      .withIndex("by_owner_sourceId", (q) => q.eq("ownerId", user._id).eq("sourceId", sourceId))
      .first();

  const upsert = async (r: Planned) => {
    const existing = await bySource(r.sourceId);
    if (existing) {
      if (existing.status === "scheduled" && (existing.title !== r.title || existing.body !== r.body)) await ctx.db.patch(existing._id, { title: r.title, body: r.body });
      return;
    }
    await ctx.db.insert("reminders", { ...r, ownerId: user._id, status: "scheduled", createdBy: "kin", at: now });
    created.push({ ...r, person: r.personId ? (byId.get(r.personId)?.name ?? null) : null });
  };

  const today = zoned(now, tz);
  const todayStart = localTime(today.y, today.m, today.d, 0, 0, tz);
  const gifts = await ctx.db.query("gifts").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();

  for (const p of people) {
    const [m, d, born] = (p.birthday ?? "").split("-").map(Number);
    if (!m || !d) continue;
    let year = today.y;
    if (localTime(year, m, d, 0, 0, tz) < todayStart) year++;
    const dayStart = localTime(year, m, d, 0, 0, tz);
    const days = Math.round((dayStart - todayStart) / DAY);
    if (days > 14) continue;
    const gift = gifts.filter((g) => g.personId === p._id && g.status !== "dismissed" && g.at > now - 30 * DAY).sort((a, z) => z.at - a.at)[0];
    const product = gift ? await ctx.db.get(gift.productId) : null;
    const body =
      gift && product
        ? gift.status === "suggested"
          ? `${product.name} is ready to send.`
          : `${product.name} is on its way.`
        : `${new Date(dayStart + 12 * HOUR).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" })}.`;
    const when = days === 0 ? "today" : "tomorrow";
    await upsert({
      personId: p._id,
      kind: "birthday",
      title: born ? `${firstName(p.name)} turns ${year - born} ${when}.` : `${firstName(p.name)}'s birthday is ${when}.`,
      body,
      fireAt: Math.max(localTime(year, m, d - 1, 9, 0, tz), now),
      channel: "both",
      sourceId: `birthday:${p._id}:${year}`,
    });
  }

  const recent = await ctx.db
    .query("updates")
    .withIndex("by_owner_at", (q) => q.eq("ownerId", user._id))
    .order("desc")
    .take(300);
  const homeCity = (user.cityId ? (await ctx.db.get(user.cityId))?.name : null) ?? user.city;

  for (const u of recent) {
    const p = byId.get(u.personId);
    if (!p) continue;

    if (u.kind === "event" && u.eventAt && u.eventAt > now && u.eventAt < now + 14 * DAY) {
      const sourceId = `event:${u._id}`;
      const rsvp = await ctx.db
        .query("rsvps")
        .withIndex("by_owner_update", (q) => q.eq("ownerId", user._id).eq("updateId", u._id))
        .unique();
      const existing = await bySource(sourceId);
      if (!rsvp?.going) {
        if (existing?.status === "scheduled") await ctx.db.patch(existing._id, { status: "dismissed" });
        continue;
      }
      if (existing?.status === "dismissed") await ctx.db.patch(existing._id, { status: "scheduled", fireAt: Math.max(u.eventAt - 2 * HOUR, now) });
      await upsert({
        personId: p._id,
        kind: "event",
        title: `${eventTitle(u.text)} at ${clock(u.eventAt, tz)}${u.place ? ` in ${u.place}` : ""}.`,
        body: `${p.name} · ${u.source}`,
        fireAt: Math.max(u.eventAt - 2 * HOUR, now),
        channel: "push",
        sourceId,
      });
    }

    if (u.kind === "trip" && u.cityId && u.at > now - 14 * DAY && (!u.until || u.until >= now)) {
      const city = await ctx.db.get(u.cityId);
      const inHome = user.cityId ? u.cityId === user.cityId : city?.name === user.city;
      const livesHere = user.cityId ? p.cityId === user.cityId : p.city === user.city;
      if (!inHome || livesHere) continue;
      await upsert({
        personId: p._id,
        kind: "trip",
        title: `${firstName(p.name)} is in ${homeCity}${u.until ? ` until ${longDate(u.until, tz, now)}` : ""}.`,
        body: `${sentence(u.text)} · ${u.source}`,
        fireAt: daytime(Math.max(u.at, now), tz),
        channel: "push",
        sourceId: `trip:${u._id}`,
      });
    }
  }

  const lastWeek = await ctx.db
    .query("reminders")
    .withIndex("by_owner_fireAt", (q) => q.eq("ownerId", user._id).gte("fireAt", now - 7 * DAY))
    .collect();
  if (!lastWeek.some((r) => r.kind === "reconnect")) {
    const drifted = people
      .filter((p) => p.lastContactAt && now - p.lastContactAt >= 182 * DAY)
      .sort((a, z) => Number(z.close) - Number(a.close) || a.lastContactAt! - z.lastContactAt!);
    for (const p of drifted) {
      const sourceId = `reconnect:${p._id}:${p.lastContactAt}`;
      if (await bySource(sourceId)) continue;
      const tenToday = localTime(today.y, today.m, today.d, 10, 0, tz);
      await upsert({
        personId: p._id,
        kind: "reconnect",
        title: `Check in with ${firstName(p.name)}.`,
        body: `You last talked on ${longDate(p.lastContactAt!, tz, now)}.`,
        fireAt: tenToday > now ? tenToday : localTime(today.y, today.m, today.d + 1, 10, 0, tz),
        channel: "push",
        sourceId,
      });
      break;
    }
  }

  return created;
}

export const plan = internalMutation({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<PlannedView[]> => {
    const now = Date.now();
    const users = userKey ? [await userByKey(ctx, userKey)] : await ctx.db.query("users").collect();
    const out: PlannedView[] = [];
    for (const user of users) {
      for (const r of await planFor(ctx, user, now)) {
        out.push({ user: user.key, kind: r.kind, title: r.title, body: r.body, fireAt: new Date(r.fireAt).toISOString(), person: r.person });
      }
    }
    if (out.length) console.log(`reminders.plan created ${out.length}: ${out.map((r) => `${r.user}/${r.kind} "${r.title}"`).join(", ")}`);
    return out;
  },
});

export const backfill = action({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<{ created: PlannedView[]; upcoming: ReminderRow[] }> => {
    const created = await ctx.runMutation(internal.reminders.plan, { userKey });
    const { upcoming } = await ctx.runQuery(api.reminders.list, { userKey });
    return { created, upcoming };
  },
});

export const list = query({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<{ upcoming: ReminderRow[]; sent: ReminderRow[] }> => {
    const user = await userByKey(ctx, userKey);
    const rows = await ctx.db
      .query("reminders")
      .withIndex("by_owner_fireAt", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(300);
    const people = new Map<Id<"people">, Doc<"people"> | null>();
    for (const r of rows) if (r.personId && !people.has(r.personId)) people.set(r.personId, await ctx.db.get(r.personId));
    const view = (r: Doc<"reminders">): ReminderRow => {
      const p = r.personId ? people.get(r.personId) : null;
      return { _id: r._id, kind: r.kind, title: r.title, body: r.body, fireAt: r.fireAt, status: r.status, channel: r.channel, createdBy: r.createdBy, person: p ? { _id: p._id, name: p.name, hue: p.hue } : null };
    };
    return {
      upcoming: rows.filter((r) => r.status === "scheduled" || r.status === "snoozed").reverse().map(view),
      sent: rows.filter((r) => r.status === "sent").slice(0, 10).map(view),
    };
  },
});

export const create = mutation({
  args: { userKey: v.optional(v.string()), personId: v.optional(v.id("people")), title: v.string(), body: v.optional(v.string()), fireAt: v.number() },
  handler: async (ctx, { userKey, personId, title, body, fireAt }) => {
    const user = await userByKey(ctx, userKey);
    if (!title.trim()) throw new Error("A reminder needs some text.");
    if (personId) {
      const person = await ctx.db.get(personId);
      if (!person || person.ownerId !== user._id) throw new Error("That person is not in your contacts.");
    }
    return await ctx.db.insert("reminders", {
      ownerId: user._id,
      personId,
      kind: "custom",
      title: title.trim(),
      body: body?.trim() ?? "",
      fireAt,
      status: "scheduled",
      channel: "push",
      createdBy: "user",
      at: Date.now(),
    });
  },
});

export const snooze = mutation({
  args: { id: v.id("reminders"), until: v.number() },
  handler: async (ctx, { id, until }) => {
    await ctx.db.patch(id, { status: "snoozed", fireAt: until });
  },
});

export const complete = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "done" });
  },
});

export const dismiss = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "dismissed" });
  },
});
