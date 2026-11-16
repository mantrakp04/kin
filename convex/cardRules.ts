export const CARD_TEMPLATES = ["job", "trip", "move", "stat", "event", "quote", "place", "plain"] as const;
export type CardTemplate = (typeof CARD_TEMPLATES)[number];

export type CardSpec = {
  template: CardTemplate;
  kicker: string;
  headline: string;
  detail: string;
  stat?: { value: string; unit: string };
  from?: string;
  to?: string;
  dateRange?: { start?: number; end?: number };
  hue: number;
  size: "wide" | "half";
  by?: "ai" | "rules";
};

export type CardInput = {
  kind: string;
  text: string;
  at: number;
  until?: number | null;
  eventAt?: number | null;
  place?: string | null;
  city?: string | null;
  personHue: number;
};

const PLACE_HUES: Record<string, number> = {
  Lisbon: 25,
  Porto: 30,
  Kyoto: 5,
  Tokyo: 350,
  Austin: 30,
  "New York": 225,
  Brooklyn: 230,
  Chicago: 205,
  Berlin: 240,
  Copenhagen: 195,
  London: 215,
  "Mexico City": 335,
  "San Francisco": 15,
  Providence: 210,
  Montauk: 190,
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const placeHue = (place: string | undefined, fallback: number) => (place ? PLACE_HUES[place] : undefined) ?? fallback;
export const cardDate = (at: number) => `${MONTHS[new Date(at).getUTCMonth()]} ${new Date(at).getUTCDate()}`;

const clean = (s: string) => s.trim().replace(/[.!]+$/, "").replace(/\s{2,}/g, " ").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clip = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ");

const STATS: Array<{ re: RegExp; unit: (text: string, m: RegExpMatchArray) => string; strip: boolean }> = [
  { re: /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/, unit: (t) => (/half marathon/i.test(t) ? "half" : /marathon/i.test(t) ? "marathon" : /\b10k\b/i.test(t) ? "10K" : "time"), strip: true },
  { re: /\b(\d+) minutes\b/i, unit: () => "min", strip: true },
  { re: /\b(\d[\d,]*)[\s-]miles?(?: of)?\b/i, unit: () => "miles", strip: true },
  { re: /\b(\d[\d,]*)\s?km\b/i, unit: () => "km", strip: true },
  { re: /\b(\d+) (photos|tracks|books|prints)\b/i, unit: (_, m) => m[2].toLowerCase(), strip: true },
  { re: /\b(5\.\d{1,2}[a-d]?|V\d{1,2})\b/, unit: () => "grade", strip: false },
];

function statKicker(text: string) {
  if (/\b(rode|ride|cycl|bike)/i.test(text)) return "Ride";
  if (/\b(ran|run|marathon|10k|5k)\b/i.test(text)) return "Run";
  if (/\b(sent|climb)/i.test(text)) return "Climb";
  if (/photos/i.test(text)) return "Photos";
  return "Milestone";
}

export function ruleCard(u: CardInput): CardSpec {
  const text = clean(u.text);
  const hue = u.personHue;

  if (u.kind === "job") {
    const asAt = text.match(/\b(?:as|to) (?:an? |the )?(.+?) at (.+)$/i);
    const joined = text.match(/\bjoined (.+?) as (?:an? |the )?(.+)$/i);
    const role = asAt?.[1] ?? joined?.[2];
    const company = asAt?.[2] ?? joined?.[1];
    return {
      template: "job",
      kicker: /promot/i.test(text) ? "Promoted" : "New role",
      headline: company ?? clip(text, 6),
      detail: role ? cap(role) : "",
      hue,
      size: "wide",
    };
  }

  const named = text.match(/\b(?:in|from|to|visiting|Visiting|In)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/)?.[1];

  if (u.kind === "move") {
    const to = u.city ?? text.match(/moved to ([^,]+)/i)?.[1] ?? named ?? clip(text, 6);
    const from = text.match(/\bfrom ([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/)?.[1];
    return {
      template: "move",
      kicker: "Moved",
      headline: to,
      detail: from ? `from ${from}` : clip(text, 10),
      from,
      to,
      hue: placeHue(to, hue),
      size: "wide",
    };
  }

  const place = u.place ?? u.city ?? named;

  if (u.kind === "trip" && place) {
    return {
      template: "trip",
      kicker: /visiting/i.test(text) ? "Visiting" : "Away",
      headline: place,
      detail: [text.match(/\b\d+ (?:photos|posts|videos)\b/)?.[0], u.until ? `until ${cardDate(u.until)}` : null].filter(Boolean).join(", ") || clip(text, 10),
      dateRange: { start: u.at, end: u.until ?? undefined },
      hue: placeHue(place, hue),
      size: "wide",
    };
  }

  if (u.kind === "event") {
    return {
      template: "event",
      kicker: /host/i.test(text) ? "Hosting" : "Event",
      headline: cap(clip(text.replace(/^hosting\s+/i, ""), 6)),
      detail: [u.place, u.eventAt ? cardDate(u.eventAt) : null].filter(Boolean).join(" · "),
      dateRange: u.eventAt ? { start: u.eventAt } : undefined,
      hue,
      size: "half",
    };
  }

  for (const s of STATS) {
    const m = text.match(s.re);
    if (!m) continue;
    const detail = s.strip ? clean(text.replace(m[0], "").replace(/\s+(in|of|a)\s*$/i, "")) : text;
    const unit = s.unit(text, m);
    return {
      template: "stat",
      kicker: statKicker(text),
      headline: m[1],
      detail: clip(detail, 10),
      stat: { value: m[1], unit },
      hue,
      size: unit === "marathon" ? "wide" : "half",
    };
  }

  if (u.kind === "milestone") {
    return { template: "plain", kicker: "Milestone", headline: clip(text, 8), detail: "", hue, size: "half" };
  }

  const [verb, ...rest] = text.split(/\s+/);
  const trailing = text.match(/^(.+?)\s+(?:at|in)\s+((?:[A-Z][\w'-]*\s?)+)$/);
  if (trailing) {
    const where = trailing[2].trim();
    return { template: "place", kicker: cap(verb.toLowerCase()), headline: where, detail: clip(trailing[1], 10), hue: placeHue(where, hue), size: "half" };
  }

  const subject = rest.join(" ").replace(/^(?:(?:a|an|the|her|his|their|new)\s+)+/i, "");
  return { template: "quote", kicker: cap(verb.toLowerCase()), headline: cap(clip(subject, 8)), detail: "", hue, size: "half" };
}
