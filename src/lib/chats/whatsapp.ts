import { e164, MAX_MESSAGES_PER_THREAD, type ChatMessage, type ChatParticipant, type ChatThread } from "./types";

type Raw = { parts: [string, string, string]; h: number; min: number; s: number; ampm?: string; sender?: string; body: string; marked: boolean };

const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const HEADER =
  /^\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s*[Mm]\.?)?(?:\]\s|\s[-\u2013]\s)(.*)$/;
const MEDIA =
  /^(<media omitted>|<attached: .*>|(image|video|audio|sticker|gif|document|contact card|voice message) omitted|.*\.(jpg|jpeg|png|webp|opus|mp4|pdf|vcf) \(file attached\)|null|this message was deleted|you deleted this message|waiting for this message.*|missed (voice|video|group voice|group video) call.*|(voice|video) call.*|location: .*|live location shared|poll:.*|view once (photo|video|voice message).*)$/i;
const SYSTEM =
  /(end-to-end encrypted|created (the )?group|created this group|\badded\b|\bremoved\b|\bleft$|changed (the subject|this group's icon|the group description|their phone number|the group name|to )|joined using this group's invite link|security code (with .*)?changed|is a contact\.?$|now an admin|disappearing messages|turned (on|off) disappearing|pinned a message|message timer|business account|blocked this contact|unblocked this contact|community)/i;
const EDITED = /\s*<this message was edited>\s*$/i;

export const normName = (s: string) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(BIDI, "").toLowerCase().replace(/[^a-z0-9+]/g, "");

export function titleFromFileName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const base = decodeURIComponent(name.split("/").pop() ?? name).replace(/\.(zip|txt)$/i, "").trim();
  const m = base.match(/^WhatsApp Chat (?:-|with)\s*(.+)$/i);
  if (m) return m[1].trim();
  if (/^_?chat$/i.test(base)) return undefined;
  return base || undefined;
}

function dateOrder(raws: Raw[]): "dmy" | "mdy" | "ymd" {
  if (raws.some((r) => r.parts[0].length === 4)) return "ymd";
  if (raws.some((r) => Number(r.parts[0]) > 12)) return "dmy";
  if (raws.some((r) => Number(r.parts[1]) > 12)) return "mdy";
  return raws.some((r) => r.ampm) ? "mdy" : "dmy";
}

function toTime(r: Raw, order: "dmy" | "mdy" | "ymd") {
  const [a, b, c] = r.parts.map(Number);
  let [y, m, d] = order === "ymd" ? [a, b, c] : order === "dmy" ? [c, b, a] : [c, a, b];
  if (y < 100) y += 2000;
  let h = r.h;
  if (r.ampm) {
    const pm = r.ampm.toLowerCase() === "p";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return new Date(y, m - 1, d, h, r.min, r.s).getTime();
}

export function parseWhatsAppExport(text: string, opts: { title?: string; selfName?: string } = {}): ChatThread | null {
  const raws: Raw[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const clean = line.replace(/[\u202f\u00a0]/g, " ");
    const m = clean.replace(BIDI, "").match(HEADER);
    if (!m) {
      const last = raws[raws.length - 1];
      if (last && line.trim()) last.body += "\n" + clean.replace(BIDI, "");
      continue;
    }
    const rest = m[8];
    const colon = rest.indexOf(": ");
    raws.push({
      parts: [m[1], m[2], m[3]],
      h: Number(m[4]),
      min: Number(m[5]),
      s: Number(m[6] ?? 0),
      ampm: m[7],
      sender: colon > 0 ? rest.slice(0, colon).trim() : undefined,
      body: colon > 0 ? rest.slice(colon + 2) : rest,
      marked: colon > 0 && /^[\u200e\u200f]/.test(clean.slice(clean.indexOf(": ") + 2)),
    });
  }
  if (raws.length === 0) return null;
  const order = dateOrder(raws);
  const title = opts.title?.trim();
  const titleKey = title ? normName(title) : "";

  const messages: Array<{ at: number; sender: string; text: string }> = [];
  let groupSignal = false;
  for (const r of raws) {
    const body = r.body.replace(EDITED, "").trim();
    if (!r.sender) {
      if (/created group|added|joined using/i.test(body)) groupSignal = true;
      continue;
    }
    if (r.marked && /created group|added|changed the subject|changed this group|joined using/i.test(body)) groupSignal = true;
    if (r.marked || !body || MEDIA.test(body)) continue;
    if (SYSTEM.test(body) && body.length < 140 && /^(you |\S+ (added|removed|left|created|changed|joined))/i.test(body)) continue;
    messages.push({ at: toTime(r, order), sender: r.sender, text: body.slice(0, 1000) });
  }
  if (messages.length === 0) return null;

  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  const senders = [...counts.keys()];
  const isGroup = groupSignal || senders.length > 2;

  const selfKey = opts.selfName ? normName(opts.selfName) : "";
  const selfFirst = opts.selfName ? normName(opts.selfName.split(" ")[0]) : "";
  let me = senders.find((s) => normName(s) === "you") ?? (selfKey ? senders.find((s) => normName(s) === selfKey) : undefined);
  if (!me && !isGroup && titleKey && senders.length === 2) me = senders.find((s) => normName(s) !== titleKey);
  if (!me && selfFirst) {
    const firsts = senders.filter((s) => normName(s.split(" ")[0]) === selfFirst && normName(s) !== titleKey);
    if (firsts.length === 1) me = firsts[0];
  }

  const participants: ChatParticipant[] = senders
    .filter((s) => s !== me)
    .map((s) => {
      const phone = /^[+\d][\d\s().-]{6,}$/.test(s) ? e164(s) : undefined;
      return { id: phone ?? `name:${normName(s)}`, name: phone ? undefined : s, phone };
    });
  const idOf = new Map(senders.filter((s) => s !== me).map((s, i) => [s, participants[i].id]));

  messages.sort((a, b) => a.at - b.at);
  const kept: ChatMessage[] = messages.slice(-MAX_MESSAGES_PER_THREAD).map((m) => ({
    at: m.at,
    fromMe: m.sender === me,
    sender: m.sender === me ? undefined : idOf.get(m.sender),
    text: m.text,
  }));
  const name = title ?? (participants.length === 1 ? (participants[0].name ?? participants[0].phone ?? "Chat") : "Group chat");
  return {
    externalId: `wa-export:${isGroup ? "g" : "p"}:${normName(name) || participants.map((p) => p.id).sort().join(",")}`,
    title: name,
    isGroup,
    participants,
    messages: kept,
  };
}
