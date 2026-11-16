/*
  Sync iMessage history from this Mac into Kin.

  npx tsx scripts/imessage/sync.ts --user alex
  Needs Node 22.13+ (built-in node:sqlite) and Full Disk Access for the terminal app
  (System Settings > Privacy & Security > Full Disk Access).
  Env: CONVEX_SITE_URL (https://<deployment>.convex.site) and BRIDGE_SECRET, or pass --env-file <path>.
  Flags: --user <key>  --db <path to chat.db>  --days <history window, default 365>  --chats <max chats, default 300>  --dry-run
*/
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readIMessageThreads } from "../../src/lib/chats/imessage";
import { e164, threadsInChunks, type ChatThread } from "../../src/lib/chats/types";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
};

const envFile = flag("env-file");
if (envFile) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const userKey = flag("user") ?? "alex";
const dbPath = flag("db") ?? join(homedir(), "Library/Messages/chat.db");
const days = Number(flag("days") ?? 365);
const maxChats = Number(flag("chats") ?? 300);
const dryRun = args.includes("--dry-run");

function contactNames(): Map<string, string> {
  const names = new Map<string, string>();
  const root = join(homedir(), "Library/Application Support/AddressBook/Sources");
  if (!existsSync(root)) return names;
  for (const source of readdirSync(root)) {
    const file = join(root, source, "AddressBook-v22.abcddb");
    if (!existsSync(file)) continue;
    try {
      const db = new DatabaseSync(file, { readOnly: true });
      const rows = db
        .prepare(
          "SELECT TRIM(COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '')) AS name, p.ZFULLNUMBER AS phone, NULL AS email FROM ZABCDRECORD r JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK " +
            "UNION ALL SELECT TRIM(COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '')), NULL, e.ZADDRESS FROM ZABCDRECORD r JOIN ZABCDEMAILADDRESS e ON e.ZOWNER = r.Z_PK",
        )
        .all() as Array<{ name: string; phone: string | null; email: string | null }>;
      for (const r of rows) {
        if (!r.name) continue;
        const key = r.phone ? e164(r.phone) : r.email?.toLowerCase();
        if (key) names.set(key, r.name);
      }
      db.close();
    } catch {}
  }
  return names;
}

async function post(threads: ChatThread[]) {
  const site = process.env.CONVEX_SITE_URL;
  const secret = process.env.BRIDGE_SECRET;
  if (!site || !secret) throw new Error("Set CONVEX_SITE_URL and BRIDGE_SECRET, or pass --env-file");
  const res = await fetch(site.replace(/\/$/, "") + "/chats/ingest", {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ userKey, source: "imessage", via: "mac", threads }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Upload failed: " + res.status + " " + JSON.stringify(body));
  return body as { messages: number; added: number };
}

async function main() {
  if (!existsSync(dbPath)) throw new Error("No chat.db at " + dbPath + ". Is Messages set up on this Mac?");
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    db.prepare("SELECT 1 FROM message LIMIT 1").all();
  } catch (e) {
    throw new Error("Can't read " + dbPath + ". Give your terminal Full Disk Access and try again. (" + (e instanceof Error ? e.message : e) + ")");
  }
  const threads = await readIMessageThreads((sql) => db.prepare(sql).all() as Record<string, unknown>[], { maxChats, sinceMs: Date.now() - days * 86400000 });
  db.close();
  const names = contactNames();
  for (const t of threads) {
    for (const p of t.participants) p.name = p.name ?? names.get(p.phone ?? p.id);
    if (!t.isGroup && /^\+?\d|@/.test(t.title)) t.title = t.participants[0]?.name ?? t.title;
  }
  const total = threads.reduce((n, t) => n + t.messages.length, 0);
  console.log("Read " + threads.length + " chats, " + total + " messages (text only).");
  if (dryRun) return;
  let added = 0;
  for (const chunk of threadsInChunks(threads)) added += (await post(chunk)).added;
  console.log("Uploaded. " + added + " new messages. Kin will update relationships in a minute.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
