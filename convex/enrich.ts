import { z } from "zod";
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { claude, isoDay } from "./assistant";
import { DAY, userByKey } from "./lib";
import { FEED_LINE_PROMPT } from "./prompts";

type WebResult = { title: string; url: string; snippet: string; publishedAt?: string };
type Source = { url: string; title: string; kind: string };
type Item = { url: string; title: string; source: string; postedAt?: string; text: string };
type Cost = { exaUsd: number; pdlMatches: number; firecrawlCredits: number; apifyItems: number; claudeCalls: number };
type CityHint = { name: string; country?: string; lat?: number; lon?: number };
type Identity = {
  likelihood: number;
  strong: boolean;
  role?: string;
  company?: string;
  city?: CityHint;
  linkedin?: string;
  x?: string;
  instagram?: string;
  github?: string;
};
type UpdateKind = "job" | "move" | "trip" | "milestone" | "event";
type NewUpdate = { text: string; kind: UpdateKind; source: string; url: string; at: number; city?: CityHint; until?: number; eventAt?: number };
type EnrichResult = { skipped?: boolean; added: number; updated: string[]; identity?: "matched" | "rejected" | "none"; cost?: Cost };

const MIN_LIKELIHOOD = 6;
const SENSITIVE = /\b(hospital|cancer|surgery|diagnos\w*|illness|rehab|funeral|passed away|died|death|grief|divorce\w*|break ?up|broke up|lawsuit|sued|arrest\w*|court|bankrupt\w*|laid off|layoffs?|debt|fired)\b/i;
const STREET = /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Lane|Ln|Drive|Dr|Way|Place|Pl)\b/;
const SOCIAL_HOSTS = ["linkedin.com", "x.com", "twitter.com", "instagram.com", "github.com", "facebook.com", "tiktok.com", "youtube.com", "medium.com", "crunchbase.com"];
const newCost = (): Cost => ({ exaUsd: 0, pdlMatches: 0, firecrawlCredits: 0, apifyItems: 0, claudeCalls: 0 });

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const normUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
const withScheme = (url?: string | null) => (url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : undefined);
const handleOf = (url?: string) => url?.replace(/\/$/, "").split("/").pop()?.replace(/^@/, "") || undefined;
const sourceName = (url: string) => {
  const host = hostOf(url);
  if (host.endsWith("linkedin.com")) return "LinkedIn";
  if (host === "x.com" || host === "twitter.com") return "X";
  if (host.endsWith("instagram.com")) return "Instagram";
  return "Web";
};
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const similar = (a: string, b: string) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let both = 0;
  for (const w of A) if (B.has(w)) both += 1;
  return both / Math.max(A.size, B.size) >= 0.8;
};
const parseDate = (s?: string | null) => {
  if (!s) return undefined;
  const at = Date.parse(s);
  return Number.isFinite(at) ? at : undefined;
};
const companyFromRole = (role: string) => role.match(/(?:\bat|\bof|@)\s+(.+)$/i)?.[1]?.trim();

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

type ExaHit = { title?: string; url: string; publishedDate?: string; image?: string; text?: string; highlights?: string[] };

async function exa(body: Record<string, unknown>, cost: Cost): Promise<ExaHit[] | null> {
  const key = process.env.EXA_API_KEY;
  if (!key) {
    console.log("EXA_API_KEY not set: Exa search skipped");
    return null;
  }
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log(`exa ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const json = await res.json();
    const usd = Number(json.costDollars?.total ?? 0);
    cost.exaUsd += usd;
    console.log(`exa "${String(body.query).slice(0, 60)}" ${body.category ?? ""}: ${json.results?.length ?? 0} results, $${usd.toFixed(4)}`);
    return json.results ?? [];
  } catch (e) {
    console.log(`exa failed: ${String(e)}`);
    return null;
  }
}

async function firecrawlSearch(query: string, limit: number, cost: Cost): Promise<ExaHit[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      console.log(`firecrawl search ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return [];
    }
    const json = await res.json();
    cost.firecrawlCredits += Number(json.creditsUsed ?? 0);
    const web: Array<{ title?: string; url?: string; description?: string }> = json.data?.web ?? [];
    console.log(`firecrawl search "${query.slice(0, 60)}": ${web.length} results, ${json.creditsUsed ?? "?"} credits`);
    return web.filter((w) => w.url).map((w) => ({ title: w.title, url: w.url!, text: w.description }));
  } catch (e) {
    console.log(`firecrawl search failed: ${String(e)}`);
    return [];
  }
}

async function search(body: Record<string, unknown>, cost: Cost): Promise<ExaHit[]> {
  return (await exa(body, cost)) ?? (await firecrawlSearch(String(body.query), Number(body.numResults ?? 5), cost));
}

export const searchWeb = internalAction({
  args: { query: v.string(), numResults: v.optional(v.number()) },
  handler: async (_ctx, { query, numResults }): Promise<{ results: WebResult[] }> => {
    const hits = await search({ query, type: "auto", numResults: Math.max(1, Math.min(numResults ?? 5, 10)), contents: { highlights: { query }, text: { maxCharacters: 600 } } }, newCost());
    return {
      results: hits.map((r) => ({
        title: r.title ?? hostOf(r.url),
        url: r.url,
        snippet: (r.highlights?.length ? r.highlights.join(" … ") : (r.text ?? "")).replace(/\s+/g, " ").trim().slice(0, 400),
        ...(r.publishedDate ? { publishedAt: r.publishedDate } : {}),
      })),
    };
  },
});

async function pdlIdentity(person: Doc<"people">, cost: Cost): Promise<Identity | "rejected" | null> {
  const key = process.env.PDL_API_KEY;
  if (!key) {
    console.log("PDL_API_KEY not set: identity step skipped");
    return null;
  }
  const knownCompany = companyFromRole(person.role);
  const params = new URLSearchParams({ name: person.name, min_likelihood: String(MIN_LIKELIHOOD), include_if_matched: "true", titlecase: "true" });
  if (person.email) params.set("email", person.email);
  if (person.phone?.startsWith("+")) params.set("phone", person.phone);
  if (person.city) params.set("locality", person.city);
  if (knownCompany) params.set("company", knownCompany);
  if (person.handles.linkedin) params.set("profile", `https://linkedin.com/in/${person.handles.linkedin}`);
  try {
    const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, { headers: { "X-Api-Key": key } });
    if (res.status === 404) {
      console.log(`pdl: no match at likelihood >= ${MIN_LIKELIHOOD} for ${person.name} (404, not billed)`);
      return "rejected";
    }
    if (!res.ok) {
      console.log(`pdl ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    cost.pdlMatches += 1;
    const json = await res.json();
    const d = json.data ?? {};
    const likelihood = Number(json.likelihood ?? 0);
    const matched: string[] = Array.isArray(json.matched) ? json.matched.map(String) : [];
    const last = person.name.trim().split(/\s+/).pop()!.toLowerCase();
    const nameOk = String(d.full_name ?? "").toLowerCase().includes(last);
    const strong = matched.some((m) => m.includes("email") || m.includes("phone"));
    const company: string | undefined = d.job_company_name ?? undefined;
    const a = knownCompany?.toLowerCase();
    const b = company?.toLowerCase();
    const companyOk = !!a && !!b && (a.includes(b) || b.includes(a));
    if (likelihood < MIN_LIKELIHOOD || !nameOk || !(strong || companyOk)) {
      console.log(`pdl: rejected candidate for ${person.name} (likelihood ${likelihood}, nameOk ${nameOk}, matched [${matched.join(",")}], companyOk ${companyOk})`);
      return "rejected";
    }
    const geo = typeof d.location_geo === "string" ? d.location_geo.split(",").map(Number) : [];
    const instagram = (d.profiles ?? []).find((p: { network?: string }) => p.network === "instagram");
    return {
      likelihood,
      strong,
      role: d.job_title && company ? `${d.job_title} at ${company}` : undefined,
      company,
      city: d.location_locality
        ? { name: d.location_locality, country: d.location_country ?? "", ...(geo.length === 2 && geo.every(Number.isFinite) ? { lat: geo[0], lon: geo[1] } : {}) }
        : undefined,
      linkedin: withScheme(d.linkedin_url),
      x: withScheme(d.twitter_url),
      instagram: withScheme(instagram?.url),
      github: withScheme(d.github_url),
    };
  } catch (e) {
    console.log(`pdl failed: ${String(e)}`);
    return null;
  }
}

async function firecrawl(url: string, cost: Cost): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    console.log("FIRECRAWL_API_KEY not set: site scrape skipped");
    return null;
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) {
      console.log(`firecrawl ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const json = await res.json();
    cost.firecrawlCredits += Number(json.data?.metadata?.creditsUsed ?? 1);
    return String(json.data?.markdown ?? "").slice(0, 3000) || null;
  } catch (e) {
    console.log(`firecrawl failed: ${String(e)}`);
    return null;
  }
}

async function apify(actor: string, input: Record<string, unknown>, cost: Cost): Promise<any[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.log(`APIFY_TOKEN not set: ${actor} skipped`);
    return [];
  }
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=90&maxItems=10&maxTotalChargeUsd=0.25&limit=10`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.log(`apify ${actor} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return [];
    }
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows.slice(0, 10) : [];
    cost.apifyItems += list.length;
    return list;
  } catch (e) {
    console.log(`apify ${actor} failed: ${String(e)}`);
    return [];
  }
}

async function socialPosts(identity: Identity, cost: Cost): Promise<Item[]> {
  if (!process.env.APIFY_TOKEN) return [];
  const since = isoDay(Date.now() - 30 * DAY);
  const tasks: Promise<Item[]>[] = [];
  const x = handleOf(identity.x);
  if (x) {
    tasks.push(
      apify("apidojo~twitter-scraper-lite", { searchTerms: [`from:${x} since:${since} -filter:replies -filter:retweets`], sort: "Latest", maxItems: 10 }, cost).then((rows) =>
        rows
          .filter((t) => typeof t.text === "string" && typeof t.url === "string")
          .map((t) => {
            const at = parseDate(t.createdAt);
            return { url: t.url, title: `@${x} on X`, source: "X", postedAt: at ? new Date(at).toISOString() : undefined, text: t.text };
          }),
      ),
    );
  }
  const ig = handleOf(identity.instagram);
  if (ig) {
    tasks.push(
      apify("apify~instagram-post-scraper", { username: [ig], resultsLimit: 10, onlyPostsNewerThan: "30 days", skipPinnedPosts: true }, cost).then((rows) =>
        rows
          .filter((p) => typeof p.caption === "string" && typeof p.url === "string")
          .map((p) => ({ url: p.url, title: `@${ig} on Instagram`, source: "Instagram", postedAt: p.timestamp, text: p.caption })),
      ),
    );
  }
  return (await Promise.all(tasks)).flat();
}

const Extraction = z.object({
  items: z.array(
    z.object({
      index: z.number(),
      samePerson: z.boolean(),
      keep: z.boolean(),
      text: z.string(),
      kind: z.enum(["job", "move", "trip", "milestone", "event"]),
      city: z.string(),
      until: z.string(),
      eventAt: z.string(),
    }),
  ),
  interests: z.array(z.string()),
});

const BATCH_PROMPT = `${FEED_LINE_PROMPT}

Batch mode. Instead of one post you will receive one JSON object with:
- person: the contact being researched: full name, company and role if known, home city, and confirmed public profile URLs
- items: public web pages, posts and search results, each with an index, source, url, title, postedAt and text
- today: the current date

The items come from searches by name, so some are about other people with the same or a similar name. For every item return its index and:
- samePerson: true only when the item clearly refers to this person: it names them and also matches their company, one of their confirmed profile URLs, or their city together with their role. A matching name alone is not enough. When unsure, false.
- keep and the other fields exactly as described above for one post. keep must be false when samePerson is false. Profile pages, company pages and directory listings with no dated change are not updates, and neither is anything older than 90 days before today.
- Use empty strings for text, city, until and eventAt when they do not apply. Dates as YYYY-MM-DD, eventAt as YYYY-MM-DDTHH:mm when a time is given. city is a city name only, never a street, venue or address.

Also return interests: 3 or 4 specific interests (for example "Modular synthesizers", "Gravel cycling") that the samePerson items clearly show. Never health, religion, politics, relationships or money. Return an empty list when the items show none.`;

export const personInput = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => await ctx.db.get(personId),
});

async function resolveCity(ctx: MutationCtx, city?: CityHint): Promise<Id<"cities"> | undefined> {
  if (!city?.name) return undefined;
  const existing = await ctx.db.query("cities").withIndex("by_name", (q) => q.eq("name", city.name)).first();
  if (existing) return existing._id;
  if (city.lat === undefined || city.lon === undefined) return undefined;
  return await ctx.db.insert("cities", { name: city.name, country: city.country ?? "", lat: Math.round(city.lat * 100) / 100, lon: Math.round(city.lon * 100) / 100 });
}

const cityArg = v.optional(v.object({ name: v.string(), country: v.optional(v.string()), lat: v.optional(v.number()), lon: v.optional(v.number()) }));

export const save = internalMutation({
  args: {
    personId: v.id("people"),
    updates: v.array(
      v.object({
        text: v.string(),
        kind: v.union(v.literal("job"), v.literal("move"), v.literal("trip"), v.literal("milestone"), v.literal("event")),
        source: v.string(),
        url: v.string(),
        at: v.number(),
        city: cityArg,
        until: v.optional(v.number()),
        eventAt: v.optional(v.number()),
      }),
    ),
    patch: v.object({
      role: v.optional(v.string()),
      city: cityArg,
      interests: v.optional(v.array(v.string())),
      handles: v.optional(v.object({ linkedin: v.optional(v.string()), x: v.optional(v.string()), instagram: v.optional(v.string()) })),
      photoUrl: v.optional(v.string()),
    }),
    sources: v.array(v.object({ url: v.string(), title: v.string(), kind: v.string() })),
  },
  handler: async (ctx, { personId, updates, patch, sources }): Promise<{ added: number; updated: string[] }> => {
    const person = await ctx.db.get(personId);
    if (!person) return { added: 0, updated: [] };
    const existing = await ctx.db.query("updates").withIndex("by_person_at", (q) => q.eq("personId", personId)).order("desc").take(200);
    const seen = existing.map((u) => ({ url: u.url ? normUrl(u.url) : null, text: u.text }));
    let added = 0;
    for (const u of updates) {
      if (seen.some((s) => (s.url && s.url === normUrl(u.url)) || similar(s.text, u.text))) continue;
      const cityId = await resolveCity(ctx, u.city);
      const updateId = await ctx.db.insert("updates", {
        personId,
        ownerId: person.ownerId,
        kind: u.kind,
        text: u.text,
        source: u.source,
        url: u.url,
        at: u.at,
        ...(cityId ? { cityId } : {}),
        ...(u.city?.name ? { place: u.city.name } : {}),
        ...(u.until ? { until: u.until } : {}),
        ...(u.eventAt ? { eventAt: u.eventAt } : {}),
      });
      seen.push({ url: normUrl(u.url), text: u.text });
      added += 1;
      await ctx.scheduler.runAfter(0, internal.memory.rememberUpdate, { updateId });
      await ctx.scheduler.runAfter(0, internal.cards.generate, { updateId });
    }

    const changes: Partial<Doc<"people">> = {};
    if (patch.role && patch.role !== person.role) changes.role = patch.role;
    if (patch.city && patch.city.name !== person.city) {
      changes.city = patch.city.name;
      const cityId = await resolveCity(ctx, patch.city);
      if (cityId) changes.cityId = cityId;
    }
    if (patch.interests?.length) {
      const interests = [...person.interests];
      for (const i of patch.interests) if (!interests.some((m) => m.toLowerCase() === i.toLowerCase())) interests.push(i);
      if (interests.length !== person.interests.length) changes.interests = interests.slice(0, 8);
    }
    if (patch.handles) {
      const handles = { ...person.handles };
      for (const k of ["linkedin", "x", "instagram"] as const) if (!handles[k] && patch.handles[k]) handles[k] = patch.handles[k];
      if (JSON.stringify(handles) !== JSON.stringify(person.handles)) changes.handles = handles;
    }
    if (patch.photoUrl && !person.photoUrl) changes.photoUrl = patch.photoUrl;
    const allSources = [...(person.sources ?? [])];
    for (const s of sources) if (!allSources.some((m) => normUrl(m.url) === normUrl(s.url))) allSources.push(s);
    await ctx.db.patch(personId, { ...changes, enrichedAt: Date.now(), sources: allSources.slice(-30) });
    return { added, updated: Object.keys(changes) };
  },
});

async function enrichPerson(ctx: ActionCtx, personId: Id<"people">): Promise<EnrichResult> {
  const cost = newCost();
  const person: Doc<"people"> | null = await ctx.runQuery(internal.enrich.personInput, { personId });
  if (!person) return { skipped: true, added: 0, updated: [] };
  if (!process.env.PDL_API_KEY && !process.env.EXA_API_KEY && !process.env.FIRECRAWL_API_KEY) {
    console.log("enrich: no PDL_API_KEY, EXA_API_KEY or FIRECRAWL_API_KEY set, skipped");
    return { skipped: true, added: 0, updated: [] };
  }

  const pdl = await pdlIdentity(person, cost);
  const identity = pdl && pdl !== "rejected" ? pdl : null;
  const company = identity?.company ?? companyFromRole(person.role);
  const profiles = identity ? [identity.linkedin, identity.x, identity.instagram, identity.github].filter((u): u is string => !!u) : [];
  const sources: Source[] = profiles.map((url) => ({ url, title: `${person.name} on ${sourceName(url) === "Web" ? hostOf(url) : sourceName(url)}`, kind: "profile" }));

  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const query = `${person.name} ${company ?? person.city}`;
  const highlights = { query: `${person.name}: new job, move, trip, launch, milestone, event` };
  const [peopleHits, recentHits, profileHits] = await Promise.all([
    exa({ query, category: "people", numResults: 3, contents: { highlights, text: { maxCharacters: 1500 } } }, cost).then((h) => h ?? []),
    search({ query, type: "auto", numResults: 8, startPublishedDate: since, contents: { highlights, text: { maxCharacters: 1500 } } }, cost),
    profiles.length
      ? exa({ query: person.name, type: "auto", numResults: 5, startPublishedDate: since, includeDomains: profiles.map(normUrl), contents: { highlights, text: { maxCharacters: 1500 } } }, cost).then((h) => h ?? [])
      : Promise.resolve([] as ExaHit[]),
  ]);
  const hits = [...peopleHits, ...recentHits, ...profileHits].filter((h, i, all) => all.findIndex((o) => normUrl(o.url) === normUrl(h.url)) === i);
  const items: Item[] = hits.map((h) => ({
    url: h.url,
    title: h.title ?? hostOf(h.url),
    source: sourceName(h.url),
    postedAt: h.publishedDate,
    text: [h.highlights?.join(" … "), h.text].filter(Boolean).join("\n").slice(0, 1800),
  }));

  const nameTokens = person.name.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const site = hits.find((h) => {
    const host = hostOf(h.url);
    return !!host && !SOCIAL_HOSTS.some((s) => host.endsWith(s)) && nameTokens.some((t) => host.split(".")[0].includes(t));
  });
  const [siteText, posts] = await Promise.all([site ? firecrawl(site.url, cost) : Promise.resolve(null), identity ? socialPosts(identity, cost) : Promise.resolve([] as Item[])]);
  if (site && siteText) items.push({ url: site.url, title: site.title ?? hostOf(site.url), source: hostOf(site.url), text: siteText });
  items.push(...posts);

  let updates: NewUpdate[] = [];
  let interests: string[] = [];
  let samePerson = new Set<number>();
  if (items.length) {
    cost.claudeCalls += 1;
    const out = await claude(
      BATCH_PROMPT,
      {
        today: isoDay(Date.now()),
        person: { name: person.name, company: company ?? null, role: identity?.role ?? person.role, homeCity: identity?.city?.name ?? person.city, profiles },
        items: items.map((it, index) => ({ index, source: it.source, url: it.url, title: it.title, postedAt: it.postedAt ?? null, text: it.text })),
      },
      Extraction,
      "enrich.person",
    );
    const now = Date.now();
    const rows = (out?.items ?? []).filter((r) => r.samePerson && items[r.index]);
    samePerson = new Set(rows.map((r) => r.index));
    updates = rows
      .filter((r) => r.keep && r.text.trim() && !SENSITIVE.test(r.text) && !STREET.test(r.text))
      .map((r) => {
        const it = items[r.index];
        const cityName = r.city.trim();
        const fromPdl = identity?.city && identity.city.name.toLowerCase() === cityName.toLowerCase() ? identity.city : undefined;
        return {
          text: r.text.trim(),
          kind: r.kind,
          source: it.source,
          url: it.url,
          at: Math.min(parseDate(it.postedAt) ?? now, now),
          ...(cityName ? { city: fromPdl ?? { name: cityName } } : {}),
          ...(parseDate(r.until) ? { until: parseDate(r.until) } : {}),
          ...(parseDate(r.eventAt) ? { eventAt: parseDate(r.eventAt) } : {}),
        };
      });
    if (samePerson.size) interests = (out?.interests ?? []).map((i) => i.trim()).filter((i) => i && !SENSITIVE.test(i)).slice(0, 4);
  }
  for (const i of samePerson) {
    const it = items[i];
    if (!sources.some((s) => normUrl(s.url) === normUrl(it.url))) sources.push({ url: it.url, title: it.title.slice(0, 120), kind: it.source === "Web" ? "web" : it.source.toLowerCase() });
  }

  const photo = identity?.linkedin ? peopleHits.find((h) => h.image && normUrl(h.url) === normUrl(identity.linkedin!))?.image : undefined;
  const handles = identity
    ? Object.fromEntries((["linkedin", "x", "instagram"] as const).map((k) => [k, handleOf(identity[k])]).filter(([, h]) => h))
    : undefined;
  const { added, updated } = await ctx.runMutation(internal.enrich.save, {
    personId,
    updates,
    patch: {
      ...(identity?.role ? { role: identity.role } : {}),
      ...(identity?.strong && identity.city ? { city: identity.city } : {}),
      ...(interests.length ? { interests } : {}),
      ...(handles ? { handles } : {}),
      ...(photo ? { photoUrl: photo } : {}),
    },
    sources,
  });
  const result: EnrichResult = { added, updated, identity: identity ? "matched" : pdl === "rejected" ? "rejected" : "none", cost };
  console.log(`enrich.person ${person.name}: ${JSON.stringify({ ...result, items: items.length, samePerson: samePerson.size })}`);
  return result;
}

export const person = internalAction({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }): Promise<EnrichResult> => await enrichPerson(ctx, personId),
});

export const userInput = internalQuery({
  args: { userKey: v.optional(v.string()) },
  handler: async (ctx, { userKey }): Promise<Id<"users">> => (await userByKey(ctx, userKey))._id,
});

export const staleFor = internalQuery({
  args: { userId: v.id("users"), before: v.number() },
  handler: async (ctx, { userId, before }): Promise<Id<"people">[]> =>
    (await ctx.db.query("people").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect()).filter((p) => !p.enrichedAt || p.enrichedAt < before).map((p) => p._id),
});

export const allUsers = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users">[]> => (await ctx.db.query("users").collect()).map((u) => u._id),
});

async function runForUser(ctx: ActionCtx, userId: Id<"users">): Promise<{ people: number; added: number }> {
  const ids: Id<"people">[] = await ctx.runQuery(internal.enrich.staleFor, { userId, before: Date.now() - DAY });
  const results = await pool(ids, 3, async (id): Promise<EnrichResult> => {
    try {
      return await enrichPerson(ctx, id);
    } catch (e) {
      console.log(`enrich ${id} failed: ${String(e)}`);
      return { added: 0, updated: [] };
    }
  });
  return { people: ids.length, added: results.reduce((n, r) => n + r.added, 0) };
}

export const runUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ people: number; added: number }> => await runForUser(ctx, userId),
});

export const run = action({
  args: { userKey: v.optional(v.string()), personId: v.optional(v.id("people")) },
  handler: async (ctx, { userKey, personId }): Promise<EnrichResult | { people: number; added: number }> => {
    const userId: Id<"users"> = await ctx.runQuery(internal.enrich.userInput, { userKey });
    if (!personId) return await runForUser(ctx, userId);
    const p: Doc<"people"> | null = await ctx.runQuery(internal.enrich.personInput, { personId });
    if (!p || p.ownerId !== userId) return { skipped: true, added: 0, updated: [] };
    return await enrichPerson(ctx, personId);
  },
});

export const daily = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const users: Id<"users">[] = await ctx.runQuery(internal.enrich.allUsers, {});
    for (const [i, userId] of users.entries()) await ctx.scheduler.runAfter(i * 60_000, internal.enrich.runUser, { userId });
  },
});
