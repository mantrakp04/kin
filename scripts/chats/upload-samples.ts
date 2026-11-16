/*
  Upload the sample WhatsApp exports and a synthetic chat.db for a demo user through /chats/ingest.
  npx tsx scripts/chats/upload-samples.ts --env-file ~/.capy/work/bridge.env --user alex
*/
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSamples, syntheticChatDb } from "./test-parsers";
import { readIMessageThreads } from "../../src/lib/chats/imessage";
import { threadsInChunks, type ChatThread } from "../../src/lib/chats/types";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const envFile = flag("env-file");
if (envFile)
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
const userKey = flag("user") ?? "alex";

async function post(source: "whatsapp" | "imessage", via: string, threads: ChatThread[]) {
  for (const chunk of threadsInChunks(threads)) {
    const res = await fetch(process.env.CONVEX_SITE_URL!.replace(/\/$/, "") + "/chats/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.BRIDGE_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify({ userKey, source, via, threads: chunk }),
    });
    console.log(source, res.status, await res.text());
  }
}

async function main() {
  await post("whatsapp", "export", parseSamples());
  const path = join(mkdtempSync(join(tmpdir(), "chatdb-")), "chat.db");
  syntheticChatDb(path);
  const db = new DatabaseSync(path, { readOnly: true });
  const threads = await readIMessageThreads((sql) => db.prepare(sql).all() as Record<string, unknown>[]);
  db.close();
  await post("imessage", "chatdb", threads);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
