# Chats: WhatsApp and iMessage import

Kin reads the text of your WhatsApp and iMessage chats to work out who you actually talk to, then uses that everywhere: the person page, "You both know", reminders, the Today brief and the assistant.

## Ways in

| Path | How | Code |
| --- | --- | --- |
| WhatsApp export | In WhatsApp: chat > name > Export chat > Without media > Kin (share sheet), or save to Files and pick it in You > Chats > Import WhatsApp chat. iOS (`[11/15/26, 9:41:23 PM] Name: text`) and Android (`15/11/2026, 21:41 - Name: text`) formats, multiline messages, media and system lines, group chats, .txt or .zip. | `src/lib/chats/whatsapp.ts`, `src/lib/chats/importFile.ts`, `src/app/import.tsx`, `src/app/+native-intent.tsx` |
| WhatsApp live sync | You > Chats > Connect WhatsApp: enter your number, Kin shows an 8-character code, then in WhatsApp go to Settings > Linked devices > Link a device > Link with phone number instead. A Baileys bridge then syncs history and new messages. | `services/whatsapp-bridge/`, `chats:connectWhatsApp` |
| iMessage from a Mac | `npx tsx scripts/imessage/sync.ts --user alex --env-file <file with CONVEX_SITE_URL and BRIDGE_SECRET>` | `scripts/imessage/sync.ts`, `src/lib/chats/imessage.ts` |
| iMessage chat.db on the phone | Copy `~/Library/Messages/chat.db` to iCloud Drive, then You > Chats > Import iMessage > Choose chat.db. Opened read-only with expo-sqlite on the device. | `src/lib/chats/importFile.ts` |

Every path produces the same shape (`src/lib/chats/types.ts`): threads with participants and text-only messages, capped at the newest 2,000 per chat.

## Routes and functions

- `POST /chats/ingest` on the Convex site URL, `Authorization: Bearer $BRIDGE_SECRET`. Body: `{ userKey, source: "whatsapp" | "imessage", via, threads: [{ externalId, title, isGroup, participants: [{ id, name?, phone? }], messages: [{ id?, at, fromMe, sender?, text }] }] }`. Used by the bridge and the Mac script. Keep posts under about 2 MB.
- `chats:importThreads` (action): the same ingest for the app (export and chat.db imports).
- `chats:status`, `chats:relationship` (queries): the You page line and the person page strip.
- `chats:relationshipsFor` (internal query, `{ ownerId }`): per person tier, messageCount, lastTalkedAt, trend, groupPeers. For the People graph.
- `chats:relationshipFor`, `chats:catchUp` (internal): back the agent tools `get_relationship` and `who_to_catch_up_with`.
- `chats:connectWhatsApp`, `chats:whatsAppStatus` (actions): call the bridge with the shared secret, so the phone never holds it.

## What Kin computes

After each ingest, `chats:recompute` matches participants to people (E.164 phone, then email, then name), creates people for unknown frequent contacts (30+ messages one to one, or 40+ in groups, active in the last year), writes group-chat edges (`chatEdges`, shown in "You both know" as "In 2 group chats together"), and per person stores in `relationshipStats`: message count, last talked, how often you talk, who starts conversations (a new conversation after 6 hours of quiet), median reply times, a tier (inner circle, close, catching up, dormant) and a trend (warming, cooling, steady). `people.lastContactAt` moves forward to the last message, which feeds the reconnect reminders.

Then `chats:extract` asks Claude (claude-opus-5-5, through `claude()` in `convex/assistant.ts`) about the 8 most active people with new messages: birthdays, upcoming plans, moves, new jobs, preferences and gift hints. Facts go to Supermemory via `memory:rememberNote`. Plans with a date become reminders, a missing birthday is filled in, and moves and new jobs become updates sourced "WhatsApp" or "iMessage" in Today. The feed refresh then runs and can name a friend who is drifting.

## Privacy

- Text only. Photos, voice notes, documents, locations, deleted messages and system lines are dropped before upload. Messages are capped at the newest 2,000 per chat and 1,000 characters each.
- Extraction never covers health, grief, breakups, money, legal matters, religion or politics, paraphrases instead of quoting, and keeps places at city level.
- Everything is stored per user (`chatThreads`, `chatMessages`, `relationshipStats`, `chatEdges`) and only shown to that user.
- `BRIDGE_SECRET` is set in Convex and in `~/.capy/work/bridge.env` on the bridge machine. Never commit it.

## WhatsApp bridge: risk

The bridge uses Baileys, an unofficial reimplementation of WhatsApp's linked-device protocol. It is against WhatsApp's Terms of Service, and WhatsApp can log out or ban numbers that use it. The user accepted this for the demo. Use a number you can afford to lose, unlink it afterwards (WhatsApp > Linked devices), and prefer the export path for anything beyond a demo.

### Run the bridge

```bash
cd services/whatsapp-bridge && npm install
npm start >> ~/.capy/work/whatsapp-bridge/bridge.log 2>&1
```

It reads `BRIDGE_SECRET` and `CONVEX_SITE_URL` from `~/.capy/work/bridge.env`, listens on port 8790 and keeps its login in `~/.capy/work/whatsapp-bridge/auth`. Publish port 8790 as a preview and set the Convex env var `BRIDGE_URL` to it (`npx convex env set BRIDGE_URL https://…`). See `services/whatsapp-bridge/README.md` for the endpoints. The bridge only runs while its machine is awake.

## Mac setup for iMessage

1. System Settings > Privacy & Security > Full Disk Access: turn on your terminal app.
2. Node 22.13 or newer (it uses the built-in `node:sqlite`).
3. In the Kin repo: `npx tsx scripts/imessage/sync.ts --user alex --env-file kin.env`, where `kin.env` holds `CONVEX_SITE_URL` and `BRIDGE_SECRET`. Add `--dry-run` to see counts without uploading.

The script opens `chat.db` read-only, decodes `attributedBody` for newer macOS versions, skips tapbacks, and adds names from the Mac's Contacts when it can.

## Tests

`npx tsx scripts/chats/test-parsers.ts` checks the WhatsApp parser on iOS and Android exports (1:1 and group chats) and the iMessage reader on a synthetic `chat.db` built with the real tables. `npx tsx scripts/chats/upload-samples.ts --env-file ~/.capy/work/bridge.env --user alex` sends those samples through `/chats/ingest`.
