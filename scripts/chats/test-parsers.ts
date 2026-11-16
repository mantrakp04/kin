import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { parseWhatsAppExport, titleFromFileName } from "../../src/lib/chats/whatsapp";
import { decodeAttributedBody, readIMessageThreads } from "../../src/lib/chats/imessage";
import { threadsInChunks, type ChatThread } from "../../src/lib/chats/types";

const DAY = 86400000;
const NOW = Date.now();
const LRM = "\u200e";
const NNBSP = "\u202f";
const pad = (n: number) => String(n).padStart(2, "0");

function iosStamp(at: number) {
  const d = new Date(at);
  const h = d.getHours() % 12 || 12;
  return "[" + (d.getMonth() + 1) + "/" + d.getDate() + "/" + String(d.getFullYear()).slice(2) + ", " + h + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + NNBSP + (d.getHours() < 12 ? "AM" : "PM") + "]";
}
function androidStamp(at: number) {
  const d = new Date(at);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + " -";
}

function chatter(seed: number, count: number, spanDays: number, speakers: string[], extra: Array<{ daysAgo: number; who: string; text: string }>) {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const lines = ["hey", "how's it going", "ha yes", "did you see that", "on my way", "sounds good", "let's do it", "running late, 10 min", "that's great news", "miss you", "lol", "what time works", "Sunday?", "perfect"];
  const out: Array<{ at: number; who: string; text: string }> = [];
  for (let i = 0; i < count; i++) {
    const at = NOW - rand() * spanDays * DAY;
    out.push({ at, who: speakers[Math.floor(rand() * speakers.length)], text: lines[Math.floor(rand() * lines.length)] });
  }
  for (const e of extra) out.push({ at: NOW - e.daysAgo * DAY, who: e.who, text: e.text });
  return out.sort((a, b) => a.at - b.at);
}

export function sampleExports() {
  const maya = chatter(1, 320, 60, ["Alex Rivera", "Maya Chen"], [
    { daysAgo: 3, who: "Maya Chen", text: "ok so it's official, I'm moving to Lisbon in January" },
    { daysAgo: 2.9, who: "Alex Rivera", text: "wait what\nthat's huge\ncongrats" },
    { daysAgo: 2, who: "Maya Chen", text: "dinner next Friday before I fly back? Nov 20 at 7" },
    { daysAgo: 1.5, who: "Maya Chen", text: "also I've been eyeing that Leica strap for ages, can't justify it" },
  ]);
  const iosMaya = [
    iosStamp(NOW - 61 * DAY) + " Maya Chen: " + LRM + "Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.",
    ...maya.map((m) => iosStamp(m.at) + " " + m.who + ": " + m.text),
    iosStamp(NOW - 1 * DAY) + " Maya Chen: " + LRM + "image omitted",
    iosStamp(NOW - 0.9 * DAY) + " Alex Rivera: see you then " + LRM + "<This message was edited>",
    iosStamp(NOW - 0.8 * DAY) + " Maya Chen: " + LRM + "<attached: 00000042-PHOTO-2026-11-14.jpg>",
  ].join("\n");

  const arjun = chatter(2, 140, 200, ["Alex Rivera", "Arjun Mehta"], [{ daysAgo: 40, who: "Arjun Mehta", text: "I start at Stripe as design lead next month" }]).filter((m) => NOW - m.at > 35 * DAY);
  const androidArjun = [
    androidStamp(NOW - 201 * DAY) + " Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.",
    ...arjun.map((m) => androidStamp(m.at) + " " + m.who + ": " + m.text),
    androidStamp(NOW - 36 * DAY) + " Arjun Mehta: <Media omitted>",
    androidStamp(NOW - 36 * DAY) + " Arjun Mehta: This message was deleted",
  ].join("\n");

  const brunch = chatter(3, 260, 45, ["Alex Rivera", "Maya Chen", "Sofia Ruiz", "Leo Park", "+1 (555) 555-0199"], []);
  const iosGroup = [
    iosStamp(NOW - 46 * DAY) + " Brunch crew: " + LRM + "Messages and calls are end-to-end encrypted.",
    iosStamp(NOW - 46 * DAY) + " Brunch crew: " + LRM + "Sofia Ruiz created group \u201cBrunch crew\u201d",
    iosStamp(NOW - 46 * DAY) + " Brunch crew: " + LRM + "Sofia Ruiz added you",
    ...brunch.map((m) => iosStamp(m.at) + " " + m.who + ": " + m.text),
    iosStamp(NOW - 2 * DAY) + " Leo Park: " + LRM + "sticker omitted",
  ].join("\n");

  const runners = chatter(4, 120, 80, ["Alex Rivera", "Leo Park", "Priya Nair", "Sam Okafor"], []);
  const androidGroup = [
    androidStamp(NOW - 81 * DAY) + " Priya Nair created group \"Sunday long run\"",
    androidStamp(NOW - 81 * DAY) + " Priya Nair added Alex Rivera",
    ...runners.map((m) => androidStamp(m.at) + " " + m.who + ": " + m.text),
    androidStamp(NOW - 5 * DAY) + " Sam Okafor left",
  ].join("\n");

  return [
    { file: "WhatsApp Chat - Maya Chen.zip", text: iosMaya, zip: true },
    { file: "WhatsApp Chat with Arjun Mehta.txt", text: androidArjun, zip: false },
    { file: "WhatsApp Chat - Brunch crew.zip", text: iosGroup, zip: true },
    { file: "WhatsApp Chat with Sunday long run.txt", text: androidGroup, zip: false },
  ];
}

function attributed(text: string) {
  const body = new TextEncoder().encode(text);
  const len = body.length < 0x80 ? [body.length] : [0x81, body.length & 0xff, body.length >> 8];
  const head = [0x04, 0x0b, ...new TextEncoder().encode("streamtyped"), 0x81, 0xe8, 0x03, 0x84, 0x01, 0x40, 0x84, 0x84, 0x84, 0x12, ...new TextEncoder().encode("NSAttributedString"), 0x00, 0x84, 0x84, 0x08, ...new TextEncoder().encode("NSObject"), 0x00, 0x85, 0x92, 0x84, 0x84, 0x84, 0x08, ...new TextEncoder().encode("NSString"), 0x01, 0x94, 0x84, 0x01, 0x2b];
  return new Uint8Array([...head, ...len, ...body, 0x86, 0x84, 0x02, 0x69, 0x49, 0x01]);
}

export function syntheticChatDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT UNIQUE, id TEXT NOT NULL, country TEXT, service TEXT NOT NULL, uncanonicalized_id TEXT, person_centric_id TEXT, UNIQUE (id, service));
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, style INTEGER, state INTEGER, account_id TEXT, properties BLOB, chat_identifier TEXT, service_name TEXT, room_name TEXT, account_login TEXT, is_archived INTEGER DEFAULT 0, last_addressed_handle TEXT, display_name TEXT, group_id TEXT, is_filtered INTEGER DEFAULT 0, successful_query INTEGER);
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, text TEXT, replace INTEGER DEFAULT 0, service_center TEXT, handle_id INTEGER DEFAULT 0, subject TEXT, country TEXT, attributedBody BLOB, version INTEGER DEFAULT 0, type INTEGER DEFAULT 0, service TEXT, account TEXT, account_guid TEXT, error INTEGER DEFAULT 0, date INTEGER, date_read INTEGER, date_delivered INTEGER, is_delivered INTEGER DEFAULT 0, is_finished INTEGER DEFAULT 0, is_emote INTEGER DEFAULT 0, is_from_me INTEGER DEFAULT 0, is_empty INTEGER DEFAULT 0, is_read INTEGER DEFAULT 0, cache_has_attachments INTEGER DEFAULT 0, cache_roomnames TEXT, item_type INTEGER DEFAULT 0, other_handle INTEGER DEFAULT 0, group_title TEXT, associated_message_guid TEXT, associated_message_type INTEGER DEFAULT 0, thread_originator_guid TEXT);
    CREATE TABLE chat_message_join (chat_id INTEGER REFERENCES chat (ROWID) ON DELETE CASCADE, message_id INTEGER REFERENCES message (ROWID) ON DELETE CASCADE, message_date INTEGER DEFAULT 0, PRIMARY KEY (chat_id, message_id));
    CREATE TABLE chat_handle_join (chat_id INTEGER REFERENCES chat (ROWID) ON DELETE CASCADE, handle_id INTEGER REFERENCES handle (ROWID) ON DELETE CASCADE, UNIQUE(chat_id, handle_id));
  `);
  const handles = ["+15555550124", "+15555550125", "+15555550122", "+15555550128", "chloe.martin@icloud.com"];
  const addHandle = db.prepare("INSERT INTO handle (id, service) VALUES (?, 'iMessage')");
  handles.forEach((h) => addHandle.run(h));
  const addChat = db.prepare("INSERT INTO chat (guid, style, chat_identifier, service_name, display_name) VALUES (?, ?, ?, 'iMessage', ?)");
  addChat.run("iMessage;-;+15555550124", 45, "+15555550124", "");
  addChat.run("iMessage;-;+15555550125", 45, "+15555550125", "");
  addChat.run("iMessage;+;chat123456", 43, "chat123456", "Dinner club");
  addChat.run("iMessage;-;chloe.martin@icloud.com", 45, "chloe.martin@icloud.com", "");
  [[1, 1], [2, 2], [3, 3], [3, 4], [3, 5], [4, 5]].forEach(([c, h]) => db.prepare("INSERT INTO chat_handle_join VALUES (?, ?)").run(c, h));
  const addMsg = db.prepare("INSERT INTO message (guid, text, attributedBody, handle_id, date, is_from_me, associated_message_type, item_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const join = db.prepare("INSERT INTO chat_message_join (chat_id, message_id, message_date) VALUES (?, ?, ?)");
  let n = 0;
  const apple = (at: number) => BigInt(Math.round(at - 978307200000)) * 1000000n;
  const put = (chat: number, handle: number, at: number, fromMe: boolean, text: string, opts: { attributedOnly?: boolean; tapback?: boolean } = {}) => {
    n++;
    const r = addMsg.run("guid-" + n, opts.attributedOnly ? null : text, attributed(text), handle, apple(at), fromMe ? 1 : 0, opts.tapback ? 2000 : 0, 0);
    join.run(chat, Number(r.lastInsertRowid), apple(at));
  };
  for (let i = 0; i < 180; i++) put(1, 1, NOW - (i * 0.4 + 0.2) * DAY, i % 3 === 0, i % 2 ? "trail run Saturday?" : "haha yes", { attributedOnly: i % 4 === 0 });
  put(1, 1, NOW - 0.1 * DAY, false, "my birthday is September 14 btw, don't forget this year");
  put(1, 1, NOW - 0.1 * DAY, false, "Loved \u201chaha yes\u201d", { tapback: true });
  for (let i = 0; i < 60; i++) put(2, 2, NOW - (120 + i * 2) * DAY, i % 2 === 0, "long " + "history ".repeat(30) + i, { attributedOnly: true });
  for (let i = 0; i < 90; i++) put(3, [0, 3, 4, 5][i % 4], NOW - i * 0.5 * DAY, i % 4 === 0, "dinner club thread " + i);
  for (let i = 0; i < 12; i++) put(4, 5, NOW - (10 + i) * DAY, i % 2 === 0, "see you at the gallery " + i);
  db.close();
}

export function parseSamples(selfName = "Alex Rivera"): ChatThread[] {
  return sampleExports().map((s) => {
    const text = s.zip ? strFromU8(unzipSync(zipSync({ "_chat.txt": strToU8(s.text) }))["_chat.txt"]) : s.text;
    const t = parseWhatsAppExport(text, { title: titleFromFileName(s.file), selfName });
    assert.ok(t, "parsed " + s.file);
    return t!;
  });
}

async function main() {
  const [maya, arjun, brunch, runners] = parseSamples();

  assert.equal(maya.isGroup, false);
  assert.equal(maya.title, "Maya Chen");
  assert.deepEqual(maya.participants.map((p) => p.name), ["Maya Chen"]);
  assert.ok(maya.messages.every((m) => !/omitted|attached|end-to-end/.test(m.text)), "media and system lines dropped");
  assert.ok(maya.messages.some((m) => m.text === "wait what\nthat's huge\ncongrats"), "multiline kept");
  assert.ok(maya.messages.some((m) => m.text === "see you then"), "edited marker stripped");
  assert.ok(maya.messages.some((m) => m.fromMe) && maya.messages.some((m) => !m.fromMe));
  assert.ok(Math.abs(maya.messages.find((m) => m.text === "see you then")!.at - (NOW - 0.9 * DAY)) < 60000, "iOS 12h timestamp parsed");
  assert.equal(maya.messages.length, 320 + 4 + 1);

  assert.equal(arjun.isGroup, false);
  assert.equal(arjun.title, "Arjun Mehta");
  assert.ok(arjun.messages.every((m) => !/Media omitted|deleted|encrypted/.test(m.text)));
  const lastArjun = arjun.messages[arjun.messages.length - 1].at;
  assert.ok(NOW - lastArjun > 35 * DAY && NOW - lastArjun < 37 * DAY, "Android DMY 24h parsed");

  assert.equal(brunch.isGroup, true);
  assert.equal(brunch.title, "Brunch crew");
  assert.deepEqual(brunch.participants.map((p) => p.name ?? p.phone).sort(), ["+15555550199", "Leo Park", "Maya Chen", "Sofia Ruiz"]);
  assert.ok(brunch.messages.every((m) => !/created group|added you|sticker/.test(m.text)));
  assert.ok(brunch.messages.filter((m) => m.sender === "+15555550199").length >= 40, "frequent unknown member");

  assert.equal(runners.isGroup, true);
  assert.deepEqual(runners.participants.map((p) => p.name).sort(), ["Leo Park", "Priya Nair", "Sam Okafor"]);
  assert.ok(runners.messages.every((m) => !/created group|added|left$/.test(m.text)));

  const dmy = parseWhatsAppExport("03/04/2026, 09:15 - Ana: hola\n13/04/2026, 21:05 - Alex Rivera: hi", { selfName: "Alex Rivera" })!;
  assert.equal(new Date(dmy.messages[0].at).getMonth(), 3, "DMY detected");
  const mdy = parseWhatsAppExport("[4/3/26, 9:15:00 PM] Ana: hola\n[4/13/26, 9:05:00 AM] Alex Rivera: hi", { selfName: "Alex Rivera" })!;
  assert.equal(new Date(mdy.messages[0].at).getMonth(), 3, "MDY detected");
  assert.equal(new Date(mdy.messages[0].at).getHours(), 21, "PM handled");
  const de = parseWhatsAppExport("[03.04.26, 09:15:00] Ana: hallo\n[13.04.26, 21:05:00] Alex Rivera: hi", { selfName: "Alex Rivera" })!;
  assert.equal(new Date(de.messages[1].at).getDate(), 13, "dotted dates");

  assert.equal(decodeAttributedBody(attributed("hello there")), "hello there");
  const long = "x".repeat(300) + " é 😀";
  assert.equal(decodeAttributedBody(attributed(long)), long);

  const dir = mkdtempSync(join(tmpdir(), "chatdb-"));
  const path = join(dir, "chat.db");
  syntheticChatDb(path);
  const db = new DatabaseSync(path, { readOnly: true });
  const threads = await readIMessageThreads((sql) => db.prepare(sql).all() as Record<string, unknown>[]);
  db.close();
  assert.equal(threads.length, 4);
  const priya = threads.find((t) => t.participants[0]?.phone === "+15555550124")!;
  assert.equal(priya.isGroup, false);
  assert.equal(priya.messages.length, 181, "tapback skipped, attributedBody-only decoded");
  assert.ok(priya.messages.every((m) => m.text.length > 0));
  assert.ok(priya.messages.some((m) => /September 14/.test(m.text)));
  const sam = threads.find((t) => t.participants[0]?.phone === "+15555550125")!;
  assert.ok(sam.messages.every((m) => m.text.startsWith("long history")), "long attributedBody decoded");
  const club = threads.find((t) => t.title === "Dinner club")!;
  assert.equal(club.isGroup, true);
  assert.equal(club.participants.length, 3);
  assert.ok(club.messages.some((m) => m.sender === "chloe.martin@icloud.com"));
  assert.ok(club.messages.filter((m) => m.fromMe).length > 0);

  const chunks = threadsInChunks([maya, brunch], 200);
  assert.equal(chunks.flat().reduce((n, t) => n + t.messages.length, 0), maya.messages.length + brunch.messages.length);

  writeFileSync(join(dir, "threads.json"), JSON.stringify({ whatsapp: [maya, arjun, brunch, runners], imessage: threads }));
  console.log("parsers ok", { whatsapp: [maya, arjun, brunch, runners].map((t) => [t.title, t.isGroup, t.messages.length]), imessage: threads.map((t) => [t.title, t.isGroup, t.messages.length]), out: join(dir, "threads.json") });
}

if (process.argv[1]?.endsWith("test-parsers.ts")) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
