import { readFileSync } from "node:fs";

const KEIKI_BASE_URL = process.env.KEIKI_BASE_URL ?? "https://onkeiki.com";
const apiKey = process.env.KEIKI_API_KEY;
const signingSecret = process.env.KEIKI_SIGNING_SECRET;
const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
const withImessage = process.argv.includes("--imessage");

if (!apiKey || !signingSecret || !site) {
  console.error("Set KEIKI_API_KEY (org-wide, deployments:write), KEIKI_SIGNING_SECRET and CONVEX_SITE_URL (public https).");
  process.exit(1);
}
if (!site.startsWith("https://")) {
  console.error("CONVEX_SITE_URL must be a public https:// URL. Keiki rejects localhost and private addresses.");
  process.exit(1);
}

const SCOPE = "kin:user";
const systemPrompt = readFileSync(new URL("../../prompts/keiki-agent.md", import.meta.url), "utf8");
const str = (description: string) => ({ type: "string", description });
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required });

const webhookTool = (name: string, description: string, inputSchema: unknown, policy: Record<string, unknown> = {}) => ({
  name,
  description,
  executionType: "webhook",
  webhookUrl: `${site}/keiki/${name}`,
  inputSchema,
  policy: { requiredScopes: [SCOPE], ...policy },
});

const tools = [
  webhookTool("get_today", "What is coming up for the user's people (birthdays with gift ideas, events) and what recently changed in their lives.", schema({}, [])),
  webhookTool("get_person", "Everything Kin knows about one person in the user's contacts: role, city, recent updates, birthday, gifts already sent.", schema({ name: str("The person's name as the user said it") }, ["name"])),
  webhookTool("who_is_in", "Which of the user's people are in a city right now (lives there or visiting).", schema({ city: str("City name, e.g. Lisbon") }, ["city"])),
  webhookTool(
    "suggest_gift",
    "The one gift Kin suggests for a person, with price, arrival day, the reason and alternatives. Returns suggestion null when there is no good idea.",
    schema({ name: str("The person's name"), occasion: str("What the gift is for, e.g. birthday") }, ["name", "occasion"]),
  ),
  webhookTool("preview_send_gift", "Preview a gift before sending it. Call with the same giftId right before send_gift.", schema({ giftId: str("giftId from suggest_gift or a notice") }, ["giftId"])),
  webhookTool("send_gift", "Pay for and order a suggested gift. The user approves it with Face ID first.", schema({ giftId: str("giftId from suggest_gift or a notice") }, ["giftId"]), {
    approval: "ask",
    approvalProof: "verified",
    preflight: true,
    previewTool: "preview_send_gift",
    freshnessFields: ["gift", "price", "arrives", "status"],
    card: {
      v: 1,
      blocks: [{ kind: "header", title: "Send a gift" }],
      theme: { approveLabel: "Send gift", declineLabel: "Not now" },
    },
  }),
  webhookTool(
    "set_rsvp",
    "Mark whether the user is going to an event a person posted.",
    schema({ updateId: str("updateId of the event from get_today or get_person"), going: { type: "boolean" } }, ["updateId", "going"]),
  ),
  webhookTool(
    "draft_message",
    "Draft two text options the user can copy and send to a person themselves. Never sends anything.",
    schema({ name: str("The person's name"), reason: str("What prompted the message, e.g. new job at Stripe") }, ["name", "reason"]),
  ),
];

const body = {
  external_ref: "kin",
  agent: { name: "Kin", system_prompt: systemPrompt },
  identity: { webhook_url: `${site}/keiki/identity`, secret: signingSecret },
  tools,
  ...(withImessage ? { channels: [{ type: "imessage" }] } : {}),
};

const res = await fetch(`${KEIKI_BASE_URL}/api/v1/developer/deployments`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const result = (await res.json().catch(() => null)) as { deployment?: { agent?: { id?: string; lineNumber?: string }; missingSecrets?: string[] }; channels?: unknown } | null;
if (!res.ok) {
  console.error(`Keiki deploy failed: ${res.status}`, JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
console.log(`\nSet it in Convex: npx convex env set KEIKI_AGENT_ID ${result?.deployment?.agent?.id ?? "<agent id above>"}`);
