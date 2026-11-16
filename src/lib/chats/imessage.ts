import { e164, MAX_MESSAGES_PER_THREAD, type ChatParticipant, type ChatThread } from "./types";

export type Row = Record<string, unknown>;
export type Query = (sql: string) => Promise<Row[]> | Row[];

const APPLE_EPOCH_MS = 978307200000;
const NSSTRING = [0x4e, 0x53, 0x53, 0x74, 0x72, 0x69, 0x6e, 0x67];

const DATE_MS = (col: string) => `(CASE WHEN ${col} > 100000000000000 THEN ${col} / 1000000 ELSE ${col} * 1000 END)`;

export function appleDateToMs(msSince2001: unknown): number {
  const n = Number(msSince2001 ?? 0);
  return n ? n + APPLE_EPOCH_MS : 0;
}

function utf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp = b;
    let n = 1;
    if (b >= 0xf0) [cp, n] = [((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f), 4];
    else if (b >= 0xe0) [cp, n] = [((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f), 3];
    else if (b >= 0xc0) [cp, n] = [((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f), 2];
    out += String.fromCodePoint(cp);
    i += n;
  }
  return out;
}

export function decodeAttributedBody(blob: unknown): string | null {
  if (!(blob instanceof Uint8Array) || blob.length < 16) return null;
  let at = -1;
  for (let i = 0; i + NSSTRING.length < blob.length; i++) {
    if (NSSTRING.every((c, j) => blob[i + j] === c)) {
      at = i + NSSTRING.length;
      break;
    }
  }
  if (at < 0) return null;
  const plus = blob.indexOf(0x2b, at);
  if (plus < 0 || plus - at > 12) return null;
  let i = plus + 1;
  let len = blob[i];
  i += 1;
  if (len === 0x81) {
    len = blob[i] | (blob[i + 1] << 8);
    i += 2;
  } else if (len === 0x82) {
    len = blob[i] | (blob[i + 1] << 8) | (blob[i + 2] << 16) | (blob[i + 3] << 24);
    i += 4;
  }
  if (!len || i + len > blob.length) return null;
  return utf8(blob.subarray(i, i + len));
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\ufffc/g, "").trim();

function participantFor(handle: string): ChatParticipant {
  const phone = e164(handle);
  if (phone) return { id: phone, phone };
  return { id: handle.toLowerCase(), name: undefined };
}

export async function readIMessageThreads(query: Query, opts: { maxChats?: number; sinceMs?: number } = {}): Promise<ChatThread[]> {
  const maxChats = opts.maxChats ?? 300;
  const chats = await query(
    "SELECT c.ROWID AS id, c.guid AS guid, c.chat_identifier AS ident, c.display_name AS name, c.style AS style, COUNT(m.ROWID) AS n, MAX(" + DATE_MS("m.date") + ") AS last " +
      "FROM chat c JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID JOIN message m ON m.ROWID = cmj.message_id " +
      "GROUP BY c.ROWID HAVING COUNT(m.ROWID) >= 3 ORDER BY last DESC LIMIT " + Math.floor(maxChats),
  );
  const threads: ChatThread[] = [];
  for (const c of chats) {
    const chatId = Math.floor(Number(c.id));
    const handles = await query("SELECT h.id AS handle FROM chat_handle_join chj JOIN handle h ON h.ROWID = chj.handle_id WHERE chj.chat_id = " + chatId);
    const participants = new Map<string, ChatParticipant>();
    for (const h of handles) if (typeof h.handle === "string") {
      const p = participantFor(h.handle);
      participants.set(p.id, p);
    }
    const rows = await query(
      "SELECT m.guid AS guid, m.text AS text, m.attributedBody AS body, m.is_from_me AS fromMe, " + DATE_MS("m.date") + " AS date, h.id AS handle " +
        "FROM chat_message_join cmj JOIN message m ON m.ROWID = cmj.message_id LEFT JOIN handle h ON h.ROWID = m.handle_id " +
        "WHERE cmj.chat_id = " + chatId + " AND COALESCE(m.associated_message_type, 0) = 0 AND COALESCE(m.item_type, 0) = 0 " +
        "ORDER BY m.date DESC LIMIT " + MAX_MESSAGES_PER_THREAD,
    );
    const isGroup = Number(c.style) === 43 || participants.size > 1;
    const messages = [];
    for (const r of rows.reverse()) {
      const text = clean(typeof r.text === "string" && r.text.trim() ? r.text : decodeAttributedBody(r.body));
      const at = appleDateToMs(r.date);
      if (!text || !at || (opts.sinceMs && at < opts.sinceMs)) continue;
      const fromMe = Number(r.fromMe) === 1;
      const handle = typeof r.handle === "string" ? participantFor(r.handle) : undefined;
      if (handle && !participants.has(handle.id)) participants.set(handle.id, handle);
      messages.push({ id: typeof r.guid === "string" ? r.guid : undefined, at, fromMe, sender: fromMe ? undefined : (handle?.id ?? [...participants.keys()][0]), text: text.slice(0, 1000) });
    }
    if (messages.length === 0 || participants.size === 0) continue;
    const list = [...participants.values()];
    const title = (typeof c.name === "string" && c.name.trim()) || (isGroup ? "Group chat" : (list[0].phone ?? list[0].id));
    threads.push({ externalId: "imsg:" + String(c.guid ?? c.ident ?? chatId), title, isGroup, participants: list, messages });
  }
  return threads;
}
