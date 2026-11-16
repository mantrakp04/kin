import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { parseChatFiles } from "../../lib/chats/importFile";
import { threadsInChunks } from "../../lib/chats/types";
import { useSession } from "../../lib/session";

export type ImportResult = { messages: number; chats: number; groups: number };

export function useChatImport() {
  const { userKey } = useSession();
  const me = useQuery(api.users.me, { userKey });
  const importThreads = useAction(api.chats.importThreads);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (files: Array<{ uri: string; name?: string }>): Promise<ImportResult> => {
    setBusy("Reading");
    try {
      const parsed = await parseChatFiles(files, me?.name);
      const result: ImportResult = { messages: 0, chats: 0, groups: 0 };
      for (const p of parsed) {
        setBusy("Uploading");
        for (const chunk of threadsInChunks(p.threads)) {
          await importThreads({ userKey, source: p.source, via: p.via, threads: chunk });
        }
        result.chats += p.threads.length;
        result.groups += p.threads.filter((t) => t.isGroup).length;
        result.messages += p.threads.reduce((n, t) => n + t.messages.length, 0);
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  return { run, busy };
}
