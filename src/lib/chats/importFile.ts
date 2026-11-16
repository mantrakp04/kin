import { File } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { strFromU8, unzipSync } from "fflate";
import { readIMessageThreads } from "./imessage";
import type { ChatSource, ChatThread, ChatVia } from "./types";
import { parseWhatsAppExport, titleFromFileName } from "./whatsapp";

export type ParsedImport = { source: ChatSource; via: ChatVia; threads: ChatThread[] };

const fileName = (uri: string, name?: string) => decodeURIComponent(name ?? uri.split("/").pop() ?? "");

export function isChatDb(uri: string, name?: string) {
  return /\.(db|sqlite|sqlite3)$/i.test(fileName(uri, name));
}

async function readIMessage(file: File): Promise<ChatThread[]> {
  const dir = decodeURIComponent(file.parentDirectory.uri.replace(/^file:\/\//, ""));
  const db = await SQLite.openDatabaseAsync(file.name, { useNewConnection: true }, dir);
  try {
    return await readIMessageThreads((sql) => db.getAllAsync<Record<string, unknown>>(sql));
  } finally {
    await db.closeAsync();
  }
}

async function readWhatsApp(file: File, name: string, selfName?: string): Promise<ChatThread | null> {
  let text: string;
  if (/\.zip$/i.test(name)) {
    const entries = unzipSync(await file.bytes(), { filter: (f) => /\.txt$/i.test(f.name) && !f.name.startsWith("__MACOSX") });
    const key = Object.keys(entries).find((k) => /_chat\.txt$/i.test(k)) ?? Object.keys(entries)[0];
    if (!key) throw new Error("That zip has no chat in it.");
    text = strFromU8(entries[key]);
  } else {
    text = await file.text();
  }
  return parseWhatsAppExport(text, { title: titleFromFileName(name), selfName });
}

export async function parseChatFiles(files: Array<{ uri: string; name?: string }>, selfName?: string): Promise<ParsedImport[]> {
  const whatsapp: ChatThread[] = [];
  const out: ParsedImport[] = [];
  for (const f of files) {
    const name = fileName(f.uri, f.name);
    const file = new File(f.uri);
    if (isChatDb(f.uri, f.name)) {
      out.push({ source: "imessage", via: "chatdb", threads: await readIMessage(file) });
      continue;
    }
    const thread = await readWhatsApp(file, name, selfName);
    if (thread) whatsapp.push(thread);
  }
  if (whatsapp.length) out.unshift({ source: "whatsapp", via: "export", threads: whatsapp });
  if (out.every((p) => p.threads.length === 0)) throw new Error("Kin couldn't find any messages in that file.");
  return out;
}
