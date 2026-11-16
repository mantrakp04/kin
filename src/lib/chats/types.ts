export type ChatSource = "whatsapp" | "imessage";
export type ChatVia = "export" | "bridge" | "mac" | "chatdb";

export type ChatParticipant = { id: string; name?: string; phone?: string };

export type ChatMessage = { id?: string; at: number; fromMe: boolean; sender?: string; text: string };

export type ChatThread = {
  externalId: string;
  title: string;
  isGroup: boolean;
  participants: ChatParticipant[];
  messages: ChatMessage[];
};

export type IngestBody = { userKey: string; source: ChatSource; via: ChatVia; threads: ChatThread[] };

export const MAX_MESSAGES_PER_THREAD = 2000;

export function e164(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const jid = /@(s\.whatsapp\.net|c\.us)$/.test(trimmed);
  if (trimmed.includes("@") && !jid) return undefined;
  const plus = trimmed.startsWith("+") || trimmed.startsWith("00") || jid;
  let digits = trimmed.replace(/[:@].*$/, "").replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7 || digits.length > 15) return undefined;
  if (!plus) {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  return `+${digits}`;
}

export function threadsInChunks(threads: ChatThread[], maxMessages = 1500): ChatThread[][] {
  const chunks: ChatThread[][] = [];
  let current: ChatThread[] = [];
  let count = 0;
  for (const t of threads) {
    for (let i = 0; i < Math.max(1, t.messages.length); i += maxMessages) {
      const part = { ...t, messages: t.messages.slice(i, i + maxMessages) };
      if (count + part.messages.length > maxMessages && current.length) {
        chunks.push(current);
        current = [];
        count = 0;
      }
      current.push(part);
      count += part.messages.length;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}
