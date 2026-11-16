# Contact enrichment (convex/enrich.ts)

Kin learns about contacts who never install the app from public sources. Every fact we store keeps the URL it came from. Locations are city level only.

## Functions

| Function | Kind | Args | Returns |
| --- | --- | --- | --- |
| `enrich:searchWeb` | internalAction | `{ query, numResults? }` (1-10, default 5) | `{ results: [{ title, url, snippet, publishedAt? }] }` |
| `enrich:person` | internalAction | `{ personId }` | `{ skipped?, added, updated: string[], identity?, cost? }` |
| `enrich:run` | public action | `{ userKey?, personId? }` | one person: same as `person`; all: `{ people, added }` |
| `enrich:daily` | internalAction (cron, 11:00 UTC) | `{}` | schedules `enrich:runUser` per user, one minute apart |

`enrich:run` without `personId` enriches every person of the user, 3 at a time, skipping anyone with `enrichedAt` in the last 24 hours. With `personId` it always runs.

`identity` is `"matched"` (PDL identity accepted), `"rejected"` (no confident match, or a candidate that failed the checks), or `"none"` (PDL not configured or errored). `cost` counts Exa dollars, PDL billed matches, Firecrawl credits, Apify items and Claude calls for that run.

## Pipeline for one person

1. **Identity, People Data Labs** (`GET https://api.peopledatalabs.com/v5/person/enrich`, header `X-Api-Key`). Inputs: name, email, phone (E.164 only), locality (contact city), company (parsed from the role, e.g. "Founder of Tiny Labs"), LinkedIn profile from the stored handle. Sent with `min_likelihood=6`, `include_if_matched=true`, `titlecase=true`. A candidate is accepted only when likelihood >= 6, the last name matches, and either PDL matched on email/phone or the returned company matches the company we already know. A same-name stranger is rejected even at likelihood 10. From an accepted match we take job title + company, city (`location_locality`, `location_geo` is the city centre), and LinkedIn / X / Instagram / GitHub URLs. PDL has no photo field.
2. **Discovery, Exa** (`POST https://api.exa.ai/search`, header `x-api-key`). Three searches in parallel: `"<name> <company or city>"` with `category: "people"` (3 results, profile pages, gives the photo); the same query over the last 90 days (`startPublishedDate`, 8 results, news and personal sites); and, for an accepted identity, the profile URLs via `includeDomains` (domain + path) over the last 90 days. Each returns highlights and up to 1,500 characters of page text. If Exa is unconfigured or errors, the general searches fall back to Firecrawl search (`POST https://api.firecrawl.dev/v2/search`, title + description only, no date filter).
3. **Personal site, Firecrawl** (`POST https://api.firecrawl.dev/v2/scrape`, `formats: ["markdown"]`, `onlyMainContent`). Only for a result whose hostname contains the person's first or last name and is not a social network. Markdown is cut to 3,000 characters.
4. **Recent posts, Apify** (`POST https://api.apify.com/v2/acts/<actor>/run-sync-get-dataset-items`, `maxItems=10`, `maxTotalChargeUsd=0.25`, `timeout=90`). Only for handles resolved by an accepted PDL identity, last 30 days, 10 items max:
   - X: `apidojo~twitter-scraper-lite` with `searchTerms: ["from:<handle> since:<date> -filter:replies -filter:retweets"]`.
   - Instagram: `apify~instagram-post-scraper` with `username: [<handle>], resultsLimit: 10, onlyPostsNewerThan: "30 days"`.
5. **Extraction, Claude** (`claude()` from `convex/assistant.ts`, model `claude-opus-5-5`). One batched call: `FEED_LINE_PROMPT` plus a batch addendum. For every item Claude returns `samePerson` (true only when the item names the person and also matches their company, a confirmed profile URL, or city + role) and the feed-line fields (`keep`, `text`, `kind`, `city`, `until`, `eventAt`), plus 3-4 specific interests from same-person items. A regex backstop drops lines about health, grief, breakups, legal or money trouble and anything that looks like a street address.
6. **Write** (`enrich:save`, one mutation). Skips updates with the same URL or near-identical text (>= 80% word overlap) as an existing update of that person. Inserts kept updates with `source` = LinkedIn / X / Instagram / Web / site hostname, and `url`. A city resolves to the `cities` table by name; a new city row is inserted only when we have lat/lon (from PDL), otherwise `cityId` stays empty and the name goes in `place`. Schedules `memory.rememberUpdate` and `cards.generate` for every new update. Patches the person only when confident: role from an accepted PDL identity, city only when PDL matched on email or phone, interests merged (cap 8), handles filled only where empty, `photoUrl` only from the Exa profile result for the PDL-confirmed LinkedIn URL. Always sets `enrichedAt`, and merges `sources` (`{ url, title, kind }`, last 30).

Every provider is optional: a missing key logs a line and that step is skipped.

## Environment variables (Convex env, read in actions only)

- `PDL_API_KEY`: identity.
- `EXA_API_KEY`: discovery and `searchWeb`.
- `FIRECRAWL_API_KEY`: personal-site scrape, and search fallback when Exa is unavailable.
- `APIFY_TOKEN`: recent public X / Instagram posts. Leave it unset to turn that step off.
- `ANTHROPIC_API_KEY`: extraction.

## Cost per call

- PDL: billed per match. A 404 (no candidate at likelihood >= 6) is free; a 200 costs one enrichment credit even if our checks then reject the candidate. Rate limit 100/min free, 1,000/min paid.
- Exa: the response's `costDollars.total` is added to `cost.exaUsd`. Exa's own docs show about $0.007 for a search; contents add a little per page. Up to 3 searches per person.
- Firecrawl: search is 2 credits per 10 results (measured: 2 credits for 5 and for 8 results); scrape is 1 credit.
- Apify: `apify~instagram-post-scraper` from $1.00 per 1,000 posts; `apidojo~twitter-scraper-lite` $0.016 per query plus a per-item tier. With 10 items this is a few cents per person, hard capped at $0.25 per actor run. On Apify's free plan the X actor runs in demo mode (5 runs a month, 10 items each).
- Claude: one Opus call per person that has any gathered items, roughly 2k-8k input tokens.

## Terms of service and privacy

- **Scraping risk.** Apify actors scrape X and Instagram without the platforms' official APIs. That likely breaches X's and Meta's terms of service, and accounts or IPs can be blocked at any time. The step is gated behind `APIFY_TOKEN` and limited to 10 public items from the last 30 days for handles tied to an accepted identity. For anything beyond a demo, replace it with official APIs or the user's own connected accounts (Composio, convex/social.ts). LinkedIn content comes only from Exa's index and PDL, never from scraping linkedin.com.
- People Data Labs is a data broker. Use it only for the user's own contacts, and honour deletion requests.
- Public sources only. Kin never logs in as anyone to read private content.
- City level only. We store a city name (and the city-centre lat/lon PDL gives), never street addresses or coordinates of a person.
- Every stored update carries its source URL, and the person's `sources` lists the pages used.
- Sensitive topics (health, grief, breakups, legal, money) are dropped by the prompt and again by a regex.
