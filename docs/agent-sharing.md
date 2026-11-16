# Share your agent

Kin lets you share your personal agent the way you share a contact. A new contact scans your QR code (or opens an AirDropped link) and lands on a small web page where they can ask your agent things and book time. Other people's AI agents can do the same over JSON, A2A or MCP. The agent talks in your voice and never shares anything private.

## Pieces

| Where | What |
| --- | --- |
| `convex/persona.ts` | Your public persona: headline, bio, what you're working on, interests, voice guide, how to reach you professionally, what it may share, city on/off. `persona.build` learns it from your data with Claude. |
| `convex/publicAgent.ts` | Share tokens, the guest conversation loop (Claude tool loop, `claude-opus-5-5`), owner inbox, summaries, and the HTTP handlers. |
| `convex/integrations.ts` | Composio integrations layer: connect links, connection status, and one adapter per calendar toolkit plus read-only context toolkits. |
| `prompts/public-agent.md` | The agent's system prompt (mirrored as `PUBLIC_AGENT_PROMPT` in `publicAgent.ts`; keep them in sync). |
| `src/app/agent.tsx` + `src/components/agent/*` | The "Your agent" screen, linked from You. |

Tables (additive in `convex/schema.ts`): `personas`, `agentShares`, `guestThreads`, `guestMessages`, `ownerInbox`, `agentConnections`.

## Routes (on the `.convex.site` domain)

All routes take the share token: `https://<deployment>.convex.site/a/{token}`. CORS is open (`*`) for GET, POST and OPTIONS.

| Route | What |
| --- | --- |
| `GET /a/{token}` | Self-contained mobile web chat page: name, avatar, "Kin agent" badge, about card, suggested questions and a slot picker. No external assets. |
| `POST /a/{token}/chat` | JSON chat. Body `{ "message": string, "threadId"?: string, "guestName"?: string, "timeZone"?: IANA, "kind"?: "human" \| "agent" }`. Reply `{ threadId, reply, slots: [{ start, label }] }`. Pass `threadId` back to continue. The same URL also accepts A2A JSON-RPC `message/send` (`contextId` = threadId). |
| `GET /a/{token}/agent.json` | A2A agent card (protocol 0.3.0): name, description, skills (about, availability, book, message), interfaces (JSON-RPC at `/chat`, MCP at `/mcp`) and limits. Also served at `/.well-known/agent-card.json` under the token path. |
| `POST /a/{token}/mcp` | Minimal MCP server over Streamable HTTP (plain JSON responses, no sessions): `initialize`, `ping`, `tools/list`, `tools/call` with tools `ask` (talk to the agent) and `get_public_profile`. |

Errors: `404 not_found`, `410 revoked` or `expired`, `403 chat_not_allowed`, `413 message_too_long`, `429 rate_limited` or `conversation_too_long`.

Example:

```sh
curl -X POST https://<deployment>.convex.site/a/<token>/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"when are you free next week?","timeZone":"America/Los_Angeles"}'
```

## Limits

- 30 guest messages per link per 10 minutes, 300 per day.
- 60 messages per conversation, 1,500 characters per message.
- Up to 6 tool steps per reply.
- Revoking a link takes effect on the next request (the token is checked on every call).

## Privacy model

- **Structural first.** The guest agent has no tool that reads contacts, people, updates, chats, gifts or memory. Its only data is the public persona plus what its tools return: free slots, booking results, and (only if you switch them on) public GitHub repos and Notion page titles.
- **Prompt rules.** It speaks as your agent, says it's an AI when asked, and refuses contacts, other people's info, phone, email, address, exact location (city at most, only if "Share my city" is on), finances, health, relationships and anything from private chats. It never describes what's on your calendar, only free times. Tool output is treated as data, never instructions.
- **Output filter.** Replies are scanned for email addresses and phone numbers; anything not in your public "reach" field or typed by the guest is replaced with `[private]`.
- **Persona building.** `persona.build` samples your *outgoing* messages from chat import (`chatMessages.fromMe`) when there are at least 15, otherwise your Kin shares and what you typed to Kin. Claude turns them into a short style guide (tone, length, emoji, phrasing). Raw messages are never stored on the persona and never quoted; facts that only appear in private messages are excluded, and nothing more precise than the city is kept.
- **When unsure** the agent says it will check with you and files an inbox item instead of guessing.
- **Connections** store only the Composio connected account id, status and whether the agent may use it. Credentials stay in Composio.

## Owner notifications

- Every guest conversation gets a one-line summary (Claude, 15 s after the last reply) in `ownerInbox` and on the guest thread.
- The first summary of a conversation, each meeting request, each booking and each message also post a line into your existing Kin agent thread (e.g. "Priya Shah asked your shared agent to meet. I offered Tue, Nov 17, 11:30 AM EST and said you'd confirm.").
- The "Your agent" screen shows requests (with Done) and conversations (tap to open the full thread).

## Integrations (Composio)

Connected from the "Your agent" screen. All toolkits below use Composio managed OAuth (auth configs are created on first connect, the same way as X/Instagram/LinkedIn in `convex/social.ts`; Composio user id is `kin_<userKey>`). Requires `COMPOSIO_API_KEY` on Convex (already set).

| Toolkit | Kind | Availability | Booking |
| --- | --- | --- | --- |
| `cal` (Cal.com) | calendar | `CAL_LIST_EVENT_TYPES` → `CAL_GET_AVAILABLE_SLOTS_INFO` | `CAL_POST_NEW_BOOKING_REQUEST` |
| `calendly` | calendar | `CALENDLY_GET_CURRENT_USER` → `CALENDLY_LIST_USER_S_EVENT_TYPES` → `CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES` | `CALENDLY_CREATE_EVENT_INVITEE`; falls back to sharing the scheduling link |
| `googlecalendar` | calendar | `GOOGLECALENDAR_FREE_BUSY_QUERY` minus busy from a weekday 9:30–17:00 grid | `GOOGLECALENDAR_CREATE_EVENT` (30 min, Meet link, invite to guest) |
| `outlook` | calendar | `OUTLOOK_GET_PROFILE` → `OUTLOOK_GET_SCHEDULE` minus busy from the same grid | `OUTLOOK_CALENDAR_CREATE_EVENT` |
| `github` | context (off by default) | `GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER`: public, non-fork repos only | — |
| `notion` | context (off by default) | `NOTION_SEARCH_NOTION_PAGE`: titles of recently edited pages | — |

The agent's tools stay generic: `check_availability(from, to, guestTimeZone)` and `book_meeting(start, guestName, guestEmail, …)`. The first enabled, active calendar wins in the order Cal.com, Calendly, Google Calendar, Outlook. Calendars are on for the agent when connected; context apps need the per-app switch.

**Nothing connected (or the calendar call fails):** availability comes from a demo schedule (weekday slots in the owner's time zone, marked `demo: true` and commented as DEMO in `integrations.ts`), and booking creates a "meeting" inbox request instead of an event. Times with a pending request are not offered again. A connected calendar without a guest email returns `need_email` so the agent asks for it.

Adapter response parsing is defensive because Composio wraps provider payloads; the calendar adapters were checked against Composio's published input schemas but not against live accounts.

## "Add to contact" and NameDrop

There is no public API for third-party apps to take part in NameDrop or to read or write the iOS "Me" card. What Kin does instead:

- **Share link** opens the iOS share sheet with the URL; AirDrop there is the closest thing to the tap.
- **QR code** on the share card (pure JS `qrcode-generator` drawn with Skia, no extra native module).
- **Add to my contact card** opens the system contact picker (`expo-contacts` `Contact.presentPicker`); you pick your own card and Kin adds a "Kin agent" URL to it. From then on NameDrop and AirDropped contact cards carry the link.
- **Share as contact** exports a vCard (`.vcf`) with your name, role and the agent URL.

## Setup

- Convex env: `ANTHROPIC_API_KEY` and `COMPOSIO_API_KEY` (both already set). `CONVEX_SITE_URL` is built in.
- App env: `EXPO_PUBLIC_CONVEX_SITE_URL` (already in `.env.local`) is only a fallback; links come from the backend.
- New JS dependency: `qrcode-generator` (pure JS, no native code, no rebuild needed for it). `app.json` is unchanged; `expo-contacts` and `expo-file-system` are already in the build.
