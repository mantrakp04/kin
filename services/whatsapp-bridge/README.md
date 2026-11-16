# Kin WhatsApp bridge

Links a WhatsApp account as a companion device (Baileys, pairing-code flow), then pushes text chat history and live messages to Convex at `$CONVEX_SITE_URL/chats/ingest`.

> ToS risk: this uses the unofficial WhatsApp Web protocol (Baileys); WhatsApp can ban or log out numbers that use it. Demo use only.

## Run (on the Capy machine)

```bash
cd /workspace/services/whatsapp-bridge
npm install            # once; npm, not bun, so the root lockfile is untouched
npm start              # = node --env-file-if-exists=/home/user/.capy/work/bridge.env bridge.mjs
```

Logs: when started detached by the agent, output goes to `/home/user/.capy/work/whatsapp-bridge/bridge.log` (counts only, never message text or secrets).

## Env

| Var | Default | Notes |
| --- | --- | --- |
| `BRIDGE_SECRET` | required | Bearer token for this API and for the Convex ingest call |
| `CONVEX_SITE_URL` | required | e.g. `https://<deployment>.convex.site` |
| `PORT` | `8790` | |
| `USER_KEY` | `alex` | Kin user the chats belong to |
| `AUTH_DIR` | `/home/user/.capy/work/whatsapp-bridge/auth` | Baileys multi-file auth state; survives restarts, so a linked device reconnects on boot |
| `WA_LOG_LEVEL` | `warn` | Baileys (pino) log level |

## API

All endpoints except `/health` need `Authorization: Bearer $BRIDGE_SECRET`.

- `GET /health` → `{ ok: true }`
- `POST /pair` `{ "phone": "+15551234567" }` → `{ code: "ABCD1234", codeDisplay: "ABCD-1234" }`. Enter it on the phone: WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead. The socket stays open for about 6 minutes waiting for the code to be entered. Returns 409 if already linked (call `/logout` first).
- `GET /status` → `{ state: "idle"|"pairing"|"connected"|"logged_out", phone?, lastSyncAt?, threads, messages, pendingThreads, lastError?, reconnecting? }`
- `POST /logout` → unlinks the device and clears `AUTH_DIR`.

## Sync

- Sources: `messaging-history.set` (full history requested), `messages.upsert`, plus contacts/chats/groups events for names and `lid-mapping.update` / message `*Alt` keys to turn `@lid` JIDs into phone JIDs.
- Text only (conversation, extended text, image/video/document captions). Skips status, broadcast and newsletter chats, reactions, protocol and media-only messages.
- Flushes every 5 s, newest 2000 messages per chat, chunked under ~1.5 MB per POST. Failed POSTs (e.g. 404 before the route exists) are requeued in memory and retried after 30 s.
- Body: `{ userKey, source: "whatsapp", via: "bridge", threads: [{ externalId, title, isGroup, participants: [{ id, name?, phone? }], messages: [{ id, at, fromMe, sender?, text }] }] }`.
- Memory only: after a restart, already-sent history is not re-sent unless WhatsApp re-delivers it; Convex should dedupe on message id anyway.
