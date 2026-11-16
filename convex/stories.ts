import { v } from "convex/values";
import { z } from "zod";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { claude } from "./assistant";
import { DAY, nextBirthday, userByKey } from "./lib";
import { SFX_CREDITS_PER_SECOND, SOUNDS, STYLES, STYLE_BY_ID, TTS_CREDITS_PER_CHAR, TTS_MODEL, VOICE_PRIORITY, isSpoken, type StoryStyle, type StyleId, type Voice } from "./storyStyles";

export const STORY_SYSTEM = [
  "You write one short vertical video script for Stories in Kin, a contacts app. There is one Story per day: the viewer's morning recap of what happened yesterday across their people and socials, plus what's coming up and their reminders, told as TikTok-style brainrot reels: fast, funny and true. Several reels in different meme formats cover the same day; you write the one reel in the format described under Style.",
  "",
  "You will receive one JSON object with the day label, the viewer's first name, and updates. Each update has a contact's full name, first name, kind, text, source, city, and when: \"yesterday\" or \"recently\" (the recap), \"coming up\" (birthdays, events, RSVPs, gifts arriving in the next 7 days), or \"reminder\" (something the viewer planned or asked to be reminded about).",
  "",
  "Story arc",
  "- Recap first: what happened yesterday (say \"yesterday\" for those). Then what's coming up and the reminders, in date order, saying when (tomorrow, Saturday). End on today's single most useful nudge, one concrete thing to do today, like texting Maya happy birthday or saying yes to Leo's drinks. If nothing happened yesterday, open with what's coming. Fit the arc to the style's format and word budget; short styles can cover just the best recap item, the next thing coming and the nudge.",
  "",
  "Truth",
  "- Use only the updates given. Every fact you state about a person (job, company, city, trip dates, race time, event) must come from their update text. Never invent details, quotes, feelings, ages, relationships, backstory or reactions for a contact. The joke comes from the format, the characters and the viewer's point of view, never from made-up facts.",
  "- Use first names in speech and captions. Use city or public place names exactly as given; never addresses or coordinates.",
  "- With many updates, pick the 3 to 5 most fun; skipping some is fine. With one update, build the whole reel around it.",
  "- Updates come from the viewer's synced socials (Instagram, LinkedIn, X, Strava) and phone contacts. When it fits naturally, say where something came from, like \"Sofia posted from Lisbon\" or \"Arjun's LinkedIn is going crazy\". Never call people contacts and never mention an address book.",
  "",
  "Kindness",
  "- Funny but kind: hype people up. Never mock, roast or diss a contact.",
  "- Leave out anything about health, bodies, weight, grief, breakups or relationships, pregnancy, money trouble, layoffs, legal trouble, religion or politics, even if an update mentions it.",
  "- No marketing. Do not mention Kin, apps, or companies other than ones named in an update (a contact's new employer, or the platform an update came from, is fine). No URLs, hashtags or emoji.",
  "",
  "Format",
  "- Follow the Style rules exactly: cast, number of turns, word budget and pacing. Stay inside the word budget so the reel fits the target seconds.",
  "- turns: speaker is one of the cast ids. text is exactly what is spoken, written the way it should be said (one twenty-four for 1:24). caption is what appears on screen in normal spelling (1:24). For text-only styles, text and caption are the same.",
  "- person is the full name of the contact a turn is about, copied exactly from the input, or an empty string.",
  "- beat is \"setup\", \"drop\" or \"line\"; use \"line\" unless the style says otherwise.",
  "- title: 2 to 5 words naming the reel's joke, lowercase.",
  "- overlay: the static on-screen lines when the style asks for them, otherwise an empty array.",
  "- characters: the id and display name of each cast member you use.",
].join("\n");

const DEFAULT_TZ = "America/New_York";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SENSITIVE = /hospital|surgery|diagnos|cancer|illness|sick|injur|rehab|funeral|passed away|died|grief|divorce|breakup|broke up|split up|pregnan|miscarr|laid off|layoff|fired from|bankrupt|debt|lawsuit|arrest|court|sentenced/i;

function parts(at: number, tz: string) {
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
    return { day: p.year + "-" + p.month + "-" + p.day, hour: Number(p.hour) };
  } catch {
    const d = new Date(at - 5 * 3600000);
    return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
  }
}

export const localDay = (at: number, tz: string) => parts(at, tz).day;

function shiftDay(day: string, by: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + by * DAY).toISOString().slice(0, 10);
}

export function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return WEEKDAYS[new Date(day + "T12:00:00Z").getUTCDay()];
}

type Item = Doc<"stories">["items"] extends (infer T)[] | undefined ? T : never;

async function collectItems(ctx: QueryCtx, user: Doc<"users">, day: string, now: number): Promise<Item[]> {
  const tz = user.tz ?? DEFAULT_TZ;
  const yesterday = shiftDay(day, -1);
  const people = await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
  const byId = new Map(people.map((p) => [p._id, p]));
  const recent = await ctx.db
    .query("updates")
    .withIndex("by_owner_at", (q) => q.eq("ownerId", user._id).gte("at", now - 9 * DAY))
    .order("desc")
    .collect();
  const item = (p: Doc<"people">, kind: string, text: string, source: string, upcoming: boolean, at: number, updateId?: Id<"updates">): Item => ({
    personId: p._id,
    updateId,
    name: p.name,
    hue: p.hue,
    photoUrl: p.photoUrl,
    kind,
    text,
    source,
    upcoming,
    at,
  });
  const when = (at: number) => {
    const days = Math.round((Date.parse(localDay(at, tz) + "T12:00:00Z") - Date.parse(day + "T12:00:00Z")) / DAY);
    return days <= 0 ? "today" : days === 1 ? "tomorrow" : "on " + WEEKDAY_NAMES[new Date(localDay(at, tz) + "T12:00:00Z").getUTCDay()];
  };
  const past = recent.filter((u) => byId.has(u.personId) && u.at <= now && u.kind !== "event" && !SENSITIVE.test(u.text));
  let recap = past.filter((u) => localDay(u.at, tz) === yesterday);
  if (recap.length < 2) recap = past.filter((u) => u.at >= now - 36 * 3600000);
  const items: Item[] = recap.slice(0, 6).map((u) => item(byId.get(u.personId)!, u.kind, u.text, u.source, false, u.at, u._id));
  const coming: Item[] = [];
  for (const p of people) {
    const b = nextBirthday(p.birthday, now);
    if (!b || b.days > 7) continue;
    coming.push(item(p, "birthday", b.days === 0 ? "Birthday today." : b.days === 1 ? "Birthday tomorrow." : "Birthday in " + b.days + " days, on " + WEEKDAY_NAMES[new Date(b.at).getUTCDay()] + ".", "Contacts", true, b.at));
  }
  for (const u of recent) {
    const p = byId.get(u.personId);
    if (!p || u.kind !== "event" || !u.eventAt || u.eventAt < now || u.eventAt > now + 7 * DAY || SENSITIVE.test(u.text)) continue;
    const rsvp = await ctx.db.query("rsvps").withIndex("by_owner_update", (q) => q.eq("ownerId", user._id).eq("updateId", u._id)).first();
    const going = rsvp ? (rsvp.going ? " You said you're going." : " You said you can't make it.") : "";
    coming.push(item(p, "event", u.text + (u.place ? " Place: " + u.place + "." : "") + " It's " + when(u.eventAt) + "." + going, u.source, true, u.eventAt, u._id));
  }
  for (const g of await ctx.db.query("gifts").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect()) {
    const p = byId.get(g.personId);
    if (!p || (g.status !== "paid" && g.status !== "ordered") || g.arriveBy < now - DAY || g.arriveBy > now + 7 * DAY) continue;
    coming.push(item(p, "gift", "The gift you sent for their " + g.occasion + " arrives " + when(g.arriveBy) + ".", "Kin", true, g.arriveBy));
  }
  const reminders = await ctx.db
    .query("reminders")
    .withIndex("by_owner_fireAt", (q) => q.eq("ownerId", user._id).gte("fireAt", Date.parse(day + "T00:00:00Z") - DAY).lte("fireAt", now + 7 * DAY))
    .collect();
  for (const r of reminders) {
    const p = r.personId ? byId.get(r.personId) : undefined;
    if (!p || r.status === "done" || r.status === "dismissed" || localDay(r.fireAt, tz) < day || SENSITIVE.test(r.title)) continue;
    if (coming.some((c) => c.personId === p._id && c.kind === r.kind) || (r.kind === "trip" && items.some((c) => c.personId === p._id))) continue;
    coming.push(item(p, "reminder", "Reminder for " + when(r.fireAt) + ": " + r.title.replace(/\.$/, "") + ".", r.body.startsWith("From your") ? "Chats" : "Reminders", true, r.fireAt));
  }
  coming.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return [...items, ...coming.slice(0, 6)];
}

async function startStory(ctx: MutationCtx, user: Doc<"users">, day: string, now: number, force: boolean, voice: boolean) {
  const existing = await ctx.db
    .query("stories")
    .withIndex("by_owner_day", (q) => q.eq("ownerId", user._id).eq("day", day))
    .unique();
  if (existing && !force && existing.status !== "error") return existing._id;
  const items = await collectItems(ctx, user, day, now);
  const status = items.length ? ("generating" as const) : ("empty" as const);
  let storyId: Id<"stories">;
  if (existing) {
    for (const r of await ctx.db.query("reels").withIndex("by_story", (q) => q.eq("storyId", existing._id)).collect()) {
      if (r.audioStorageId) await ctx.storage.delete(r.audioStorageId);
      if (r.videoStorageId) await ctx.storage.delete(r.videoStorageId);
      await ctx.db.delete(r._id);
    }
    await ctx.db.patch(existing._id, { status, items, seenAt: undefined, at: now });
    storyId = existing._id;
  } else {
    storyId = await ctx.db.insert("stories", { ownerId: user._id, day, status, items, at: now });
  }
  if (!items.length) return storyId;
  for (const [order, style] of STYLES.entries()) {
    const reelId = await ctx.db.insert("reels", {
      storyId,
      ownerId: user._id,
      style: style.id,
      order,
      visuals: { kind: style.background.kind, scene: style.background.scene, palette: style.background.palette },
      status: "pending",
      at: now,
    });
    await ctx.scheduler.runAfter(order * 250, internal.stories.generateReel, { reelId });
  }
  if (voice && day === localDay(now, user.tz ?? DEFAULT_TZ)) await ctx.scheduler.runAfter(30000, internal.stories.voiceStory, { storyId, attempt: 0 });
  return storyId;
}

export const start = internalMutation({
  args: {
    userKey: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    day: v.optional(v.string()),
    now: v.number(),
    force: v.optional(v.boolean()),
    voice: v.optional(v.boolean()),
  },
  handler: async (ctx, { userKey, userId, day, now, force, voice }) => {
    const user = userId ? await ctx.db.get(userId) : await userByKey(ctx, userKey);
    if (!user) throw new Error("No user");
    return await startStory(ctx, user, day ?? localDay(now, user.tz ?? DEFAULT_TZ), now, force ?? false, voice ?? true);
  },
});

export const generate = action({
  args: { userKey: v.optional(v.string()), day: v.optional(v.string()), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Id<"stories">> => await ctx.runMutation(internal.stories.start, { ...args, now: Date.now() }),
});

export const generateForUser = internalAction({
  args: { userId: v.id("users"), day: v.string() },
  handler: async (ctx, { userId, day }): Promise<Id<"stories">> => await ctx.runMutation(internal.stories.start, { userId, day, now: Date.now() }),
});

export const dailyTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const user of await ctx.db.query("users").collect()) {
      const { day, hour } = parts(now, user.tz ?? DEFAULT_TZ);
      if (hour === 7) await startStory(ctx, user, day, now, false, true);
    }
  },
});

const Script = z.object({
  title: z.string(),
  overlay: z.array(z.string()),
  characters: z.array(z.object({ id: z.string(), name: z.string() })),
  turns: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
      caption: z.string(),
      person: z.string(),
      beat: z.enum(["setup", "drop", "line"]),
    }),
  ),
});
export type StoryScript = z.infer<typeof Script>;

export const reelInput = internalQuery({
  args: { reelId: v.id("reels") },
  handler: async (ctx, { reelId }) => {
    const reel = await ctx.db.get(reelId);
    if (!reel) return null;
    const story = await ctx.db.get(reel.storyId);
    const user = await ctx.db.get(reel.ownerId);
    if (!story || !user) return null;
    const tz = user.tz ?? DEFAULT_TZ;
    const people = await Promise.all((story.items ?? []).map((i) => ctx.db.get(i.personId)));
    return {
      style: reel.style as StyleId,
      day: dayLabel(story.day, localDay(Date.now(), tz)),
      viewer: user.name.split(" ")[0],
      updates: (story.items ?? []).map((i, n) => ({
        name: i.name,
        firstName: i.name.split(" ")[0],
        kind: i.kind,
        text: i.text,
        source: i.source,
        city: people[n]?.city ?? null,
        when: !i.upcoming ? (i.at && localDay(i.at, tz) !== localDay(story.at, tz) ? "yesterday" : "recently") : i.kind === "reminder" ? "reminder" : "coming up",
      })),
    };
  },
});

export const saveReel = internalMutation({
  args: {
    reelId: v.id("reels"),
    status: v.union(v.literal("scripting"), v.literal("voicing"), v.literal("ready"), v.literal("error")),
    script: v.optional(v.any()),
    audioStorageId: v.optional(v.id("_storage")),
    audioProvider: v.optional(v.string()),
    wordTimings: v.optional(v.array(v.object({ w: v.string(), s: v.number(), e: v.number(), t: v.number() }))),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { reelId, ...patch }) => {
    const reel = await ctx.db.get(reelId);
    if (!reel) return;
    await ctx.db.patch(reelId, Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)));
    if (patch.status !== "ready" && patch.status !== "error") return;
    const story = await ctx.db.get(reel.storyId);
    if (!story || story.status !== "generating") return;
    const reels = await ctx.db.query("reels").withIndex("by_story", (q) => q.eq("storyId", reel.storyId)).collect();
    const settled = reels.map((r) => (r._id === reelId ? patch.status : r.status));
    if (settled.includes("ready")) await ctx.db.patch(story._id, { status: "ready" });
    else if (settled.every((s) => s === "error")) await ctx.db.patch(story._id, { status: "error" });
  },
});

function styleBrief(style: StoryStyle) {
  return [
    "Style: " + style.name + " (" + style.id + ")",
    "Format: " + style.format,
    "Cast: " + style.cast.map((c) => c.id + " = " + c.name + ", " + c.role).join("; "),
    "Target: " + style.seconds[0] + " to " + style.seconds[1] + " seconds, " + style.words[0] + " to " + style.words[1] + " words in total.",
    "Rules:",
    style.rules,
  ].join("\n");
}

function clean(script: StoryScript, style: StoryStyle, names: string[]): StoryScript {
  const ids = new Set(style.cast.map((c) => c.id));
  const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
  const byFirst = new Map(names.map((n) => [n.split(" ")[0].toLowerCase(), n]));
  return {
    ...script,
    turns: script.turns
      .filter((t) => t.caption.trim() || t.text.trim())
      .map((t) => ({
        ...t,
        speaker: ids.has(t.speaker) ? t.speaker : style.cast[0].id,
        person: byLower.get(t.person.toLowerCase()) ?? byFirst.get(t.person.split(" ")[0].toLowerCase()) ?? "",
      })),
  };
}

export const generateReel = internalAction({
  args: { reelId: v.id("reels") },
  handler: async (ctx, { reelId }) => {
    const input = await ctx.runQuery(internal.stories.reelInput, { reelId });
    if (!input) return;
    const style = STYLE_BY_ID[input.style];
    await ctx.runMutation(internal.stories.saveReel, { reelId, status: "scripting" });
    let script: StoryScript | null = null;
    try {
      const raw = await claude(STORY_SYSTEM + "\n\n" + styleBrief(style), input, Script, "story " + style.id);
      if (raw) script = clean(raw, style, input.updates.map((u) => u.name));
    } catch (e) {
      await ctx.runMutation(internal.stories.saveReel, { reelId, status: "error", error: "script: " + String(e).slice(0, 300) });
      return;
    }
    if (!script || !script.turns.length) {
      await ctx.runMutation(internal.stories.saveReel, { reelId, status: "error", error: "script: no output (is ANTHROPIC_API_KEY set?)" });
      return;
    }
    await ctx.runMutation(internal.stories.saveReel, { reelId, status: "ready", script, audioProvider: isSpoken(style) ? "device" : "none" });
  },
});

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function fromBase64(s: string) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let n = 0;
  for (const ch of clean) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

type Take = { bytes: Uint8Array; words: { w: string; s: number; e: number }[] };

async function elevenRemaining() {
  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" } });
  if (!res.ok) throw new Error("elevenlabs subscription " + res.status);
  const sub = (await res.json()) as { character_count: number; character_limit: number };
  return sub.character_limit - sub.character_count;
}

async function elevenSpeech(text: string, voice: Voice): Promise<Take> {
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voice.eleven + "/with-timestamps?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: { stability: voice.stability ?? 0.45, similarity_boost: 0.75, speed: voice.speed ?? 1 },
    }),
  });
  if (!res.ok) throw new Error("elevenlabs " + res.status + ": " + (await res.text()).slice(0, 200));
  const json = (await res.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null };
  const words: Take["words"] = [];
  const a = json.alignment;
  if (a) {
    let current: Take["words"][number] | null = null;
    a.characters.forEach((ch, i) => {
      if (/\s/.test(ch)) {
        if (current) words.push(current);
        current = null;
        return;
      }
      if (!current) current = { w: "", s: a.character_start_times_seconds[i], e: 0 };
      current.w += ch;
      current.e = a.character_end_times_seconds[i];
    });
    if (current) words.push(current);
  }
  return { bytes: fromBase64(json.audio_base64), words };
}

const MP3_BYTES_PER_SEC = 128000 / 8;
const reelCredits = (script: StoryScript) => Math.ceil(script.turns.reduce((n, t) => n + t.text.length, 0) * TTS_CREDITS_PER_CHAR);

export const voiceReel = internalAction({
  args: { reelId: v.id("reels") },
  handler: async (ctx, { reelId }): Promise<string> => {
    const reel = await ctx.runQuery(internal.stories.reelForVoice, { reelId });
    if (!reel) return "missing";
    if (reel.audioStorageId) return "cached";
    const style = STYLE_BY_ID[reel.style as StyleId];
    const script = reel.script as StoryScript | undefined;
    if (!script || !isSpoken(style)) return "not spoken";
    if (!process.env.ELEVENLABS_API_KEY) return "no key";
    const needed = reelCredits(script);
    const remaining = await elevenRemaining();
    if (remaining < needed) {
      await ctx.runMutation(internal.stories.saveReel, { reelId, status: "ready", audioProvider: "device", error: "quota: " + remaining + " credits left, reel needs " + needed });
      return "quota";
    }
    const voices = new Map(style.cast.map((c) => [c.id, c.voice]));
    const groups: { speaker: string; turns: number[] }[] = [];
    script.turns.forEach((turn, t) => {
      const last = groups[groups.length - 1];
      if (last && last.speaker === turn.speaker) last.turns.push(t);
      else groups.push({ speaker: turn.speaker, turns: [t] });
    });
    const chunks: Uint8Array[] = [];
    const wordTimings: { w: string; s: number; e: number; t: number }[] = [];
    let offset = 0;
    try {
      for (const group of groups) {
        const texts = group.turns.map((t) => script.turns[t].text.trim());
        const take = await elevenSpeech(texts.join(" "), voices.get(group.speaker) ?? style.cast[0].voice);
        const owners = group.turns.flatMap((t, k) => texts[k].split(/\s+/).filter(Boolean).map(() => t));
        take.words.forEach((w, k) => wordTimings.push({ w: w.w, s: offset + w.s, e: offset + w.e, t: owners[Math.min(k, owners.length - 1)] }));
        chunks.push(take.bytes);
        offset += take.bytes.length / MP3_BYTES_PER_SEC;
      }
    } catch (e) {
      await ctx.runMutation(internal.stories.saveReel, { reelId, status: "ready", audioProvider: "device", error: "tts: " + String(e).slice(0, 300) });
      return "error";
    }
    const audio = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    chunks.reduce((at, c) => (audio.set(c, at), at + c.length), 0);
    const audioStorageId = await ctx.storage.store(new Blob([audio], { type: "audio/mpeg" }));
    await ctx.runMutation(internal.stories.saveReel, { reelId, status: "ready", audioStorageId, audioProvider: "elevenlabs", wordTimings });
    return "voiced " + needed + " credits";
  },
});

export const reelForVoice = internalQuery({
  args: { reelId: v.id("reels") },
  handler: async (ctx, { reelId }) => await ctx.db.get(reelId),
});

export const storyReels = internalQuery({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => (await ctx.db.query("reels").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect()).map((r) => ({ _id: r._id, style: r.style, status: r.status })),
});

export const voiceStory = internalAction({
  args: { storyId: v.id("stories"), attempt: v.number() },
  handler: async (ctx, { storyId, attempt }) => {
    if (!process.env.ELEVENLABS_API_KEY) return;
    const reels = await ctx.runQuery(internal.stories.storyReels, { storyId });
    if (reels.some((r) => r.status === "pending" || r.status === "scripting") && attempt < 20) {
      await ctx.scheduler.runAfter(15000, internal.stories.voiceStory, { storyId, attempt: attempt + 1 });
      return;
    }
    const byStyle = new Map(reels.map((r) => [r.style, r]));
    for (const id of VOICE_PRIORITY) {
      const reel = byStyle.get(id);
      if (!reel || reel.status !== "ready" || !isSpoken(STYLE_BY_ID[id])) continue;
      const result = await ctx.runAction(internal.stories.voiceReel, { reelId: reel._id });
      if (result === "quota") return;
    }
  },
});

export const soundKeys = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("storySounds").collect()).map((s) => s.key),
});

export const saveSound = internalMutation({
  args: { key: v.string(), storageId: v.id("_storage"), prompt: v.string(), credits: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("storySounds", { ...args, at: Date.now() });
  },
});

export const buildSounds = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    if (!process.env.ELEVENLABS_API_KEY) return ["ELEVENLABS_API_KEY not set: the app uses its bundled sounds"];
    const have = new Set(await ctx.runQuery(internal.stories.soundKeys, {}));
    const log: string[] = [];
    for (const sound of SOUNDS) {
      if (have.has(sound.key)) continue;
      const credits = Math.ceil(sound.seconds * SFX_CREDITS_PER_SECOND);
      const remaining = await elevenRemaining();
      if (remaining < credits) {
        log.push("stopped at " + sound.key + ": " + remaining + " credits left, needs " + credits);
        break;
      }
      const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ text: sound.prompt, duration_seconds: sound.seconds, loop: sound.loop, prompt_influence: 0.5 }),
      });
      if (!res.ok) {
        log.push(sound.key + " failed " + res.status + ": " + (await res.text()).slice(0, 200));
        break;
      }
      const storageId = await ctx.storage.store(new Blob([await res.arrayBuffer()], { type: "audio/mpeg" }));
      await ctx.runMutation(internal.stories.saveSound, { key: sound.key, storageId, prompt: sound.prompt, credits });
      log.push(sound.key + " saved (" + credits + " credits)");
    }
    return log;
  },
});

export const list = query({
  args: { userKey: v.optional(v.string()), now: v.optional(v.number()) },
  handler: async (ctx, { userKey, now: clientNow }) => {
    const user = await userByKey(ctx, userKey);
    const now = clientNow ?? Date.now();
    const tz = user.tz ?? DEFAULT_TZ;
    const today = localDay(now, tz);
    const recent = await ctx.db
      .query("updates")
      .withIndex("by_owner_at", (q) => q.eq("ownerId", user._id).gte("at", now - 8 * DAY))
      .order("desc")
      .collect();
    const counts = new Map<string, number>();
    const firsts = new Map<string, Id<"people">>();
    for (const u of recent) {
      if (u.at > now || u.kind === "event") continue;
      const day = localDay(u.at, tz);
      counts.set(day, (counts.get(day) ?? 0) + 1);
      if (!firsts.has(day)) firsts.set(day, u.personId);
    }
    const days = [];
    for (let i = 0; i < 1; i++) {
      const day = shiftDay(today, -i);
      const story = await ctx.db
        .query("stories")
        .withIndex("by_owner_day", (q) => q.eq("ownerId", user._id).eq("day", day))
        .unique();
      const updates = counts.get(day) ?? 0;
      if (!story && !updates && i > 0) continue;
      if (story?.status === "empty" && i > 0) continue;
      const reels = story ? await ctx.db.query("reels").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect() : [];
      const fallback = firsts.has(day) ? await ctx.db.get(firsts.get(day)!) : null;
      const lead = story?.items?.find((x) => !x.upcoming) ?? story?.items?.[0] ?? fallback;
      days.push({
        day,
        label: dayLabel(day, today),
        storyId: story?._id ?? null,
        status: story?.status ?? null,
        ready: reels.filter((r) => r.status === "ready").length,
        total: reels.length,
        updates,
        recap: story?.items?.filter((x) => !x.upcoming).length ?? updates,
        coming: story?.items?.filter((x) => x.upcoming).length ?? 0,
        cover: lead ? { name: lead.name, hue: lead.hue, photoUrl: lead.photoUrl ?? null } : null,
        seen: !!story?.seenAt,
      });
    }
    return days;
  },
});

export const get = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;
    const user = await ctx.db.get(story.ownerId);
    const reels = (await ctx.db.query("reels").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect()).sort((a, b) => a.order - b.order);
    const sounds: Record<string, string> = {};
    for (const s of await ctx.db.query("storySounds").collect()) {
      const url = await ctx.storage.getUrl(s.storageId);
      if (url) sounds[s.key] = url;
    }
    return {
      _id: story._id,
      day: story.day,
      label: dayLabel(story.day, localDay(Date.now(), user?.tz ?? DEFAULT_TZ)),
      status: story.status,
      items: await Promise.all(
        (story.items ?? []).map(async (i) => {
          const photo = i.updateId ? await ctx.db.query("updatePhotos").withIndex("by_update", (q) => q.eq("updateId", i.updateId!)).first() : null;
          return { ...i, postPhotoUrl: photo ? await ctx.storage.getUrl(photo.storageId) : null };
        }),
      ),
      sounds,
      reels: await Promise.all(
        reels.map(async (r) => ({
            _id: r._id,
            style: r.style,
            status: r.status,
            error: r.error ?? null,
            script: (r.script ?? null) as StoryScript | null,
            audioUrl: r.audioStorageId ? await ctx.storage.getUrl(r.audioStorageId) : null,
            videoUrl: r.videoStorageId ? await ctx.storage.getUrl(r.videoStorageId) : null,
            audioProvider: r.audioProvider ?? null,
            wordTimings: r.wordTimings ?? null,
        })),
      ),
    };
  },
});

export const markSeen = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (story && !story.seenAt) await ctx.db.patch(storyId, { seenAt: Date.now() });
  },
});

export const videoUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const setVideo = internalMutation({
  args: { reelId: v.id("reels"), storageId: v.id("_storage") },
  handler: async (ctx, { reelId, storageId }) => {
    const reel = await ctx.db.get(reelId);
    if (!reel) throw new Error("No reel");
    if (reel.videoStorageId) await ctx.storage.delete(reel.videoStorageId);
    await ctx.db.patch(reelId, { videoStorageId: storageId, status: "ready" });
    const story = await ctx.db.get(reel.storyId);
    if (story && story.status !== "ready") await ctx.db.patch(story._id, { status: "ready" });
  },
});

export const setUpdatePhoto = internalMutation({
  args: { updateId: v.id("updates"), storageId: v.id("_storage"), prompt: v.string(), credit: v.string() },
  handler: async (ctx, args) => {
    const old = await ctx.db.query("updatePhotos").withIndex("by_update", (q) => q.eq("updateId", args.updateId)).first();
    if (old) {
      await ctx.storage.delete(old.storageId);
      await ctx.db.delete(old._id);
    }
    await ctx.db.insert("updatePhotos", { ...args, at: Date.now() });
  },
});

export const linkItems = internalMutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story?.items) return 0;
    let linked = 0;
    const items = await Promise.all(
      story.items.map(async (i) => {
        if (i.updateId) return i;
        const updates = await ctx.db.query("updates").withIndex("by_person_at", (q) => q.eq("personId", i.personId)).collect();
        const u = updates.find((x) => i.text === x.text || i.text.startsWith(x.text));
        if (!u) return i;
        linked++;
        return { ...i, updateId: u._id };
      }),
    );
    await ctx.db.patch(storyId, { items });
    return linked;
  },
});
