# Integrations: Claude, Supermemory, Whop, Keiki

Everything runs in Convex. Every integration reads its keys from Convex environment variables and degrades cleanly when they are missing, so the app works end to end without any key (see "Demo fallback" below).

Set variables with `npx convex env set NAME value` (they apply to the deployment, not to `.env.local`).

## Environment variables

| Variable | Needed for | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Gift picker, person note, message drafts | Without it: `gifts.suggest` returns null (the seeded suggestion still shows), `assistant.personNote` returns `""`, `assistant.draftMessage` returns `[]`. |
| `SUPERMEMORY_API_KEY` | Per-person memory | Without it every memory call is a no-op. |
| `WHOP_API_KEY` | Real checkout | Account API key. Without it payments are simulated. |
| `WHOP_WEBHOOK_SECRET` | `POST /whop/webhook` | The `ws_...` secret, exactly as Whop shows it. Without it the webhook answers 503. |
| `WHOP_ENVIRONMENT` | Whop | `sandbox` (default) or `production`. Sandbox and production share no keys, products or webhooks. |
| `WHOP_ACCOUNT_ID` | Whop, optional | `biz_...`. Whop resolves it from the key, so it is optional. `WHOP_COMPANY_ID` is accepted as an alias. |
| `WHOP_REDIRECT_URL` | Whop, optional | Where the hosted checkout sends the buyer afterwards. |
| `KEIKI_API_KEY` | Proactive notices, agent setup | Org-wide key with `deployments:write` and `agents:write`. |
| `KEIKI_SIGNING_SECRET` | Every `/keiki/*` endpoint | The identity-webhook secret you pass when deploying the agent. Without it every `/keiki/*` route answers 503. |
| `KEIKI_AGENT_ID` | Proactive notices | Printed by `scripts/keiki/deploy.ts`. |
| `KEIKI_BASE_URL` | optional | Defaults to `https://onkeiki.com`. |

**Public URL.** Whop and Keiki only call public `https://` URLs; they reject localhost and private addresses. The local anonymous deployment serves HTTP actions at `http://127.0.0.1:3211`, which they cannot reach. For real webhooks either run on a cloud Convex deployment (`npx convex login`, then `npx convex dev`; the site URL is `https://<name>.convex.site`) or tunnel the local one (`cloudflared tunnel --url http://127.0.0.1:3211`). Below, `<CONVEX_SITE_URL>` means that public URL.

## Claude (gift picker, notes, drafts)

- `convex/assistant.ts`: `claude()` helper calls `client.messages.parse({ model: "claude-opus-5-5", max_tokens: 16000, system, messages, output_config: { format: zodOutputFormat(schema) } })` and returns null on `stop_reason === "refusal"` or a missing `parsed_output`. Checked against the current structured-outputs docs and the installed `@anthropic-ai/sdk` 1.8.0 types.
- `gifts.suggest` (internal) and `gifts.suggestForPerson` (public, takes `userKey`) build the B1 input: recipient, last-90-day updates as signals `{id, text, source, date}`, Supermemory profile and memories for "gift ideas for {occasion}" as extra signals (`memory_N` ids), sent-gift history, budget (`user.budget`, default 60), `arriveBy` (next birthday, else 14 days out) and the catalog. Only `match: "strong"` is saved, and only after code checks that the product exists, fits the budget, arrives by `arriveBy` and was not sent before. Alternatives get the same checks.
- `assistant.personNote` runs B3 and returns `{ note }`. `assistant.draftMessage` runs B4 and returns `{ options }` (at most two). The B4 schema is `{ options: string[] }` rather than a fixed two-item tuple, because tuple schemas are not something to rely on in structured outputs; the code keeps the first two.
- Prompts live in `prompts/*.md` and, verbatim, in `convex/prompts.ts` (Convex cannot read files at runtime). Edit both together. B2 (`FEED_LINE_PROMPT`) is exported but not wired to a function yet.

## Supermemory (per-person memory)

- Uses the REST API directly with `fetch`; no SDK is installed. The API is v5: what the brief calls a container tag is now a **namespace**, and routes are `/ns/<namespace>/...`.
- One namespace per contact: `person_<peopleId>`.
- `memory.rememberUpdate { updateId }` and `memory.rememberGift { giftId }` write a document (`POST /ns/<ns>/document` with a stable `id` of `update_<id>` / `gift_<id>`, `dreaming: "instant"` so memories exist within seconds; that costs one extra operation per document).
- `memory.recall { personId, query }` returns `{ profile, memories }` from `POST /ns/<ns>/profile` and `POST /ns/<ns>/search` (`searchMode: "memories"`, limit 5).
- `memory.list { personId }` lists the namespace's documents for debugging.
- `gifts.markOrdered` schedules `memory.rememberGift` whenever a gift becomes ordered.
- Setup: create a key at console.supermemory.ai, `npx convex env set SUPERMEMORY_API_KEY sm_...`, then `npx convex run memory:backfill` to write every seeded update.

## Whop (payment)

Flow: the app calls `payments.startCheckout { userKey, giftId, productId }` and gets `{ url }`. If `productId` is one of the alternatives, the gift is swapped to it first. The gift is re-validated (budget, delivery, not already sent).

With `WHOP_API_KEY` set, it creates a checkout configuration (`POST https://sandbox-api.whop.com/api/v1/checkout_configurations`, `Api-Version-Date: 2026-11-14-1`, an idempotency key per gift and product) with an inline one-time variant at the product price and `metadata: { giftId }`, stores the configuration id in `gifts.checkoutId`, and returns its `purchase_url`. The app opens it with `expo-web-browser`. Test card: `4242 4242 4242 4242`, any future date, any CVC.

Webhook: in the Whop dashboard (sandbox: sandbox.whop.com → Developer → Webhooks) create a webhook to `<CONVEX_SITE_URL>/whop/webhook`, API version `v1`, event `payment.succeeded`, and store its secret as `WHOP_WEBHOOK_SECRET`. The handler verifies the Standard Webhooks signature the way Whop's own SDK does (HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the literal `ws_...` secret bytes, base64, `v1,<sig>`, 5-minute window), finds the gift by `data.metadata.giftId` (or `data.checkout_configuration_id`), marks it **paid**, and 1.5 s later marks it **ordered** (simulated fulfilment). Repeat deliveries are harmless: transitions only move suggested → paid → ordered. The client can never mark a gift paid.

Docs vs brief: Whop calls the business an **account** (`account_id`, `biz_...`), and it is optional for this call. Whop's iOS SDK (`WhopCheckout`, Apple Pay) is native Swift and would need a native module; this build uses the hosted checkout page instead.

### Demo fallback (no Whop keys)

When `WHOP_API_KEY` is not set, `startCheckout` returns `{ url: null }`, logs `whop not configured: simulated payment`, and schedules `gifts.markPaid` immediately and `gifts.markOrdered` 1.5 s later. **No money moves and nothing is ordered.** This exists only so the in-app and iMessage flows work in the demo. Setting `WHOP_API_KEY` turns it off.

## Keiki (Kin in Messages)

The Keiki agent is cloud-served: Keiki runs the loop with the B5 prompt, and every tool is a webhook into Convex.

### Endpoints (all `POST`, under `<CONVEX_SITE_URL>`)

| Route | Tool input | Does |
| --- | --- | --- |
| `/keiki/identity` | identity webhook | Resolves the iMessage sender to a Kin user by phone, sets `keikiOptIn`, returns `{ userId, scopes: ["kin:user"] }`; unknown numbers get a deterministic reply and no scopes. |
| `/keiki/get_today` | `{}` | Coming up (birthdays with gift, events with `updateId`) and recent changes. |
| `/keiki/get_person` | `{ name }` | Role, city, updates, birthday, gifts sent. |
| `/keiki/who_is_in` | `{ city }` | People in that city, city-level only. |
| `/keiki/suggest_gift` | `{ name, occasion }` | The live suggestion, or runs the picker; `suggestion: null` when there is none. |
| `/keiki/preview_send_gift` | `{ giftId }` | Preview plus the Vault approval card. |
| `/keiki/send_gift` | `{ giftId }` | Preflight (`context.preflight`) rejects already sent, over budget, too late. Real calls require `context.approval` (Face ID). Charges via the same payment path with `via: "imessage"` and reports `status: "ordered"` only once the gift is ordered. With Whop configured it returns `status: "payment_required"` and the checkout URL. |
| `/keiki/set_rsvp` | `{ updateId, going }` | Sets the RSVP. |
| `/keiki/draft_message` | `{ name, reason }` | Runs B4 and returns two options. Never sends. |

Each route verifies `X-Keiki-Timestamp` / `X-Keiki-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">` with `KEIKI_SIGNING_SECRET` (5-minute window, constant-time compare), then resolves the caller from `context.phone` via `users.by_phone` (falls back to matching the last 10 digits). Unknown numbers get 403.

**Opt-in.** Keiki calls `/keiki/identity` once per new sender, which is our "first inbound message". That, or the first tool call from a known number, sets `users.keikiOptIn = true`. Kin never starts a conversation: `sendBirthdayNotice` refuses while `keikiOptIn` is false, and Keiki itself only delivers notices to an existing conversation. `npx convex run keiki:setOptIn '{"userKey":"alex","optIn":false}'` resets it.

### Proactive notice

`keiki.sendBirthdayNotice { userKey?, giftId? }` (the hidden demo trigger calls `anyApi.keiki.sendBirthdayNotice`) picks the given gift or the soonest suggested one and posts to `POST https://onkeiki.com/api/v1/developer/agents/<KEIKI_AGENT_ID>/notice` with `{ text, phone }`. The text names the person, occasion and date, product, price, arrival day, reason, alternatives and the `giftId`; the agent words the message itself (B5 "notice" rules). Without Keiki keys it logs the notice and returns `{ sent: false, reason: "keiki not configured", text }`.

### Create the agent (about 10 minutes)

1. Make the Convex HTTP actions public (see "Public URL").
2. Keiki dashboard → Settings → API keys: create an **org-wide** key with `deployments:write` and `agents:write` (or `*`).
3. Pick a signing secret (`openssl rand -hex 32`) and set the variables:
   ```bash
   npx convex env set KEIKI_API_KEY sk_...
   npx convex env set KEIKI_SIGNING_SECRET <secret>
   ```
4. Deploy the agent (does not buy a line unless you pass `--imessage`; that line is a paid add-on):
   ```bash
   KEIKI_API_KEY=sk_... KEIKI_SIGNING_SECRET=<secret> CONVEX_SITE_URL=https://<name>.convex.site bun scripts/keiki/deploy.ts --imessage
   npx convex env set KEIKI_AGENT_ID <agent id it prints>
   ```
   The script posts one partner deployment (`POST /api/v1/developer/deployments`, `external_ref: "kin"`, rerunnable) with the B5 prompt from `prompts/keiki-agent.md`, the identity webhook, and the eight webhook tools above (all with `requiredScopes: ["kin:user"]`).
5. Make sure the demo user's `users.phone` is the iPhone's number in E.164. Install Keiki Vault from the App Store on that phone, text the agent's number, and approve one card to enroll Face ID.

`send_gift` policy, as deployed:

```json
{
  "requiredScopes": ["kin:user"],
  "approval": "ask",
  "approvalProof": "verified",
  "preflight": true,
  "previewTool": "preview_send_gift",
  "freshnessFields": ["gift", "price", "arrives", "status"],
  "card": { "v": 1, "blocks": [{ "kind": "header", "title": "Send a gift" }], "theme": { "approveLabel": "Send gift", "declineLabel": "Not now" } }
}
```

`approvalFallback` is left unset, so it defaults to `refuse`: where no Face ID card can be shown, the gift is not sent and a typed "yes" never approves it.

### Where the Keiki docs differ from the brief

- **Card fields come from a preview tool.** Card templates can only read the call's arguments, and `send_gift` only carries `giftId`. So `preview_send_gift` returns the finished card (header "Send a gift", fields Recipient, Gift, Price, Arrives, buttons "Send gift" / "Not now"), which Keiki prefers over the template. The template keeps the "Send a gift" header as a fallback. `freshnessFields` re-check price, product, arrival and status at approval time.
- **Preflight is not a separate route.** Keiki calls the same webhook with `context.preflight: true` before showing the card; a non-2xx answer goes back to the model as `preflight_rejected`.
- **Signing needs an identity webhook.** Keiki only signs webhook-tool requests for agents with an identity webhook, and the identity webhook can only be set through the partner deployments API. That is why the setup is a deployment script rather than `kit.sync`, and why `KEIKI_SIGNING_SECRET` is the identity secret.
- **Face ID cards need a dedicated Keiki iMessage line in a 1:1 chat.** On other lines or channels, `approvalProof: "verified"` with the default fallback refuses the send.
- **Notices are rewritten by the agent**, never delivered verbatim, and need an existing conversation for that phone (404 otherwise).

## Verifying locally

```bash
npx convex run payments:startCheckout '{"userKey":"alex","giftId":"<maya gift id>","productId":"<its product id>"}'
npx convex run gifts:get '{"giftId":"<maya gift id>"}'     # paid, then ordered ~1.5 s later
npx convex run demo:resetMayaGift '{}'                       # back to suggested
curl -i -X POST http://127.0.0.1:3211/keiki/get_today -d '{}' # 503 without KEIKI_SIGNING_SECRET, 401 with it but unsigned
npx convex run keiki:sendBirthdayNotice '{}'                 # refused until the user has texted Kin
```


## Kin agent (one agent for the app, the feed and iMessage)

Kin has exactly one agent, in `convex/agent.ts` (loop, thread storage, Keiki dispatch) and `convex/agentTools.ts` (tool schemas and thin wrappers over existing functions). The system prompt is `prompts/kin-agent.md`, copied verbatim into `KIN_AGENT_PROMPT` in `convex/prompts.ts`.

- `agent:instruct { userKey?, text?, action? }` (public mutation) stores the user message in the user's one thread (`agentThreads`, `agentMessages`), turns a structured action into a readable sentence ("Send Maya the Kodak Ektar H35."), marks the thread running and schedules `agent:run`. Returns `{ threadId, messageId }`.
- `agent:thread { userKey? }` (public query) returns the last 80 messages: `user`, `assistant` (optionally with an `action` card), `tool` (one activity line with `status` running/done/error) and `event` (the daily brief). `agent:followUp { userKey?, messageId }` returns the action cards produced after one instruction, used by the gift button to open checkout.
- `agent:run { threadId }` (internal): a tapped action (`send_gift`, `set_rsvp`, `draft_message`, `share_update`) runs its tool directly and writes a short fixed reply, so taps are fast and need no model call. Typed text runs a Claude tool-use loop (`claude-opus-5-5`, `messages.create` with `tools`, at most 8 steps, last 40 thread rows as history including earlier tool calls and results). Messages that arrive while a run is in progress are picked up when it settles.
- Tools: get_today, get_person, who_is_in, search_people, search_web (`enrich:searchWeb`), enrich_person (`enrich:person`), recall_memory, remember (`memory:rememberNote`), suggest_gift, send_gift, set_rsvp, draft_message (plus `social:draftDm` when the user wants a DM), mutual_connections (`social:mutuals`), create_reminder, design_card, share_update. Functions owned by the enrichment and social modules are called by name through `makeFunctionReference`; if one is missing the tool returns an error to the model instead of failing the run.
- **Never spends without a tap, enforced in code.** `send_gift` only charges when the current instruction is the structured action `{ type: "send_gift", payload: { giftId } }` for that same gift, once per instruction. Otherwise (typed "send it") it writes an assistant message with action `confirm_send_gift` and pays nothing; the app renders it as a Send gift button that calls `agent:instruct` with the structured action. Payment goes through `chargeGift` (the same path as `payments.startCheckout`); a checkout URL comes back as an assistant message with action `{ type: "open_url", payload: { url } }`, which the gift card opens with `expo-web-browser`.
- `agent:refreshFeed { userId }` (internal, cron every 6 hours through `agent:refreshAll`) computes a signature of the day, the newest updates, birthdays in the next 3 days and plain cards, and skips when it matches the last run. Otherwise the same agent suggests gifts for birthdays without one, redesigns plain cards, refreshes up to two people, and writes a one-line brief as an `event` message (nothing when it answers "nothing new"). Background tool calls are not written to the chat.

### iMessage through the same agent (Keiki external harness)

Keiki supports this: an agent's harness can be `external` with `harness_config: { mode: "push", dispatchUrl }` (docs: onkeiki.com/docs/external-harness, partner deployments accept the same fields; the deployment then reports `agent.dispatch { mode, dispatchUrl }`). Keiki keeps the line, delivery and Vault approvals; our app runs the loop.

- `POST <CONVEX_SITE_URL>/keiki/turn` (`agent.keikiTurn`) verifies `Keiki-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` with `KEIKI_HARNESS_SECRET` (5-minute window, constant-time compare), answers `202` at once, and schedules `agent:imessageTurn`. Cancellations, arrivals and reactions are acknowledged and ignored (unconsumed arrivals go back to Keiki's queue for the next turn).
- `agent:imessageTurn` maps `conversationId` (the phone) to the Kin user with the existing `keiki.resolveCaller`, appends the texts to that user's thread with `channel: "imessage"`, runs the same loop, posts the reply to `{turnUrl}/messages` and settles with `{turnUrl}/complete`. Notices (`silent` messages) are given to the model as server context; a reply of "nothing new" is not sent. Turn API calls use the `kts1` credential signed with the same secret, because the action runs in another process than the request that carried the `Keiki-Turn-Token`.
- `send_gift` on iMessage calls the deployed `send_gift` webhook tool through the turn's MCP endpoint (`turn.keiki.mcpUrl`), so Keiki's policy (`approval: "ask"`, `approvalProof: "verified"`, preview card) still asks for Face ID in Keiki Vault before `/keiki/send_gift` charges. A typed "yes" never pays. The existing `/keiki/*` webhook tools stay as they are.

Switch the deployed agent (external_ref `kin`) to dispatch mode. **Not run yet**; this moves iMessage turns off Keiki's hosted loop:

```bash
KEIKI_API_KEY=sk_... CONVEX_SITE_URL=https://incredible-caribou-302.convex.site \
  bun scripts/keiki/dispatch.ts --rotate-secret -- --env-file ~/.capy/work/convex-deploy.env
```

It posts `{ external_ref: "kin", agent: { name, system_prompt, harness: "external", harness_config: { mode: "push", dispatchUrl: "<site>/keiki/turn", timeoutMs: 120000 } } }` to `/api/v1/developer/deployments` (tools and the identity webhook are left as deployed), and with `--rotate-secret` mints a harness signing secret (`POST /api/v1/developer/agents/:id/harness/signing-secret`, shown once) and stores it as `KEIKI_HARNESS_SECRET` with `npx convex env set` without printing it. Until it runs, `/keiki/turn` answers 503 and iMessage keeps using the hosted loop. To go back to the hosted loop, change the agent's harness in the Keiki dashboard.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `KEIKI_HARNESS_SECRET` | `POST /keiki/turn` and turn API calls | The `whsec_...` harness signing secret. Separate from `KEIKI_SIGNING_SECRET` (identity and webhook tools). |

