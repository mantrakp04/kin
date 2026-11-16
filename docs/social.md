# Social connections (Composio)

Kin lets a user connect their own X, Instagram and LinkedIn accounts through [Composio](https://docs.composio.dev) so it can tell them which of their contacts know each other ("You both know") and prepare DMs. Kin never posts and never sends a DM: `social:draftDm` only returns a draft and a deep link the user opens themselves.

Code: `convex/social.ts` (Convex default runtime, plain `fetch` against Composio REST v3.1, no SDK or Node runtime needed), UI in `src/components/social/`.

## What each platform realistically allows

| Platform | Composio toolkit | Managed OAuth | What Kin reads | Contact graph | DMs |
| --- | --- | --- | --- | --- | --- |
| X / Twitter | `twitter` (84 tools) | **No.** Removed Feb 2026; you must bring your own X developer app | `TWITTER_USER_LOOKUP_ME`, `TWITTER_FOLLOWING_BY_USER_ID`, `TWITTER_FOLLOWERS_BY_USER_ID` (paginated, 1000 per page) | **Yes.** Your following and followers are matched to contacts; for up to 30 matched contacts Kin also reads *their* following list, which is what produces contact-to-contact mutuals | API can send (`TWITTER_SEND_A_NEW_MESSAGE_TO_A_USER`) but Kin does not. It returns `https://x.com/messages/compose?recipient_id=<id>&text=<draft>` (needs the contact's X user id, filled in by sync) or the profile URL |
| Instagram | `instagram` (40 tools) | Yes | `INSTAGRAM_GET_USER_INFO` for your own handle | **No.** Only Business/Creator accounts work at all, and the Graph API returns follower *counts*, never follower or following lists. Personal accounts cannot be connected | Business accounts can reply in existing conversations only (`INSTAGRAM_SEND_TEXT_MESSAGE`, needs a prior thread). Kin returns `https://ig.me/m/<handle>` |
| LinkedIn | `linkedin` (29 tools) | Yes | `LINKEDIN_GET_MY_INFO` for your own profile | **No.** The official API has no connections list (only your profile, posting, comments, org stats) | No messaging API. Kin returns `https://www.linkedin.com/in/<handle>` |

So in practice: X is the only platform where Kin can learn who follows whom. Instagram and LinkedIn connections only confirm the user's own handle. Instagram/LinkedIn mutuals in the demo come from `social:seedDemoEdges` (flagged `demo: true`).

Rate limits: X enforces per-app plan tiers; follower/following endpoints are heavily limited on low tiers. Sync caps each list at 2000 users and each contact's following list at 1000, and the daily cron staggers users one minute apart.

## Setup

1. `COMPOSIO_API_KEY` (a Platform project key) must be in the Convex environment. It already is on `incredible-caribou-302`.
2. Instagram and LinkedIn work with no further setup. `social:connectLink` reuses an enabled auth config for the toolkit or creates one with `use_composio_managed_auth`.
3. **X needs a custom auth config**, otherwise `connectLink` returns:
   `Composio 404 POST /auth_configs: Default auth config not found for toolkit "twitter". Composio does not have managed credentials for this toolkit.`
   To fix:
   - Create an app at https://developer.x.com/en/portal/dashboard, attach it to a project, enable OAuth 2.0 (type: Web App), and add Composio's callback URL shown in the Composio dashboard as a redirect URI. Scopes needed: `users.read tweet.read follows.read offline.access` (add `dm.read dm.write` only if you ever want API DMs).
   - Your X plan must include the follows endpoints (`GET /2/users/:id/following` and `/followers`).
   - In the Composio dashboard (Platform → Auth configs → Create → Twitter), choose OAuth2 with your client id and secret. Once it is enabled, `connectLink` picks it up automatically (it lists `/auth_configs?toolkit_slug=twitter` first).
4. The app opens the Connect Link with `WebBrowser.openAuthSessionAsync(url, Linking.createURL("you"))` and passes the same URL as `callback_url`, so Composio returns to `kin://you` (or the Expo dev URL). On return the app calls `social:refresh`, which marks the account ACTIVE and schedules `social:sync`.

## Functions

- `social:connectLink { userKey?, toolkit, redirect? } -> { url, connected, error? }` (public action). Composio user id is `kin_<userKey>`. Returns `connected: true` and schedules a sync if an ACTIVE account already exists.
- `social:refresh { userKey? }` (public action) pulls connected-account status from Composio and schedules a sync.
- `social:accounts { userKey? } -> [{ toolkit, connected, status, handle? }]` (public query).
- `social:sync { userId }` (internal action). Matches by X user id, then handle (`people.handles.x`), then unique normalized full name. Writes `socialEdges`, sets `people.socialIds.twitter`, `people.handlesVerified`, and fills a missing handle. Each newly seen contact-to-contact mutual schedules `memory.rememberNote` for both people ("Arjun Mehta and Leo Park follow each other on X ...").
- `social:syncAll` runs from the daily cron ("social sync", 11:00 UTC).
- `social:mutuals { personId } -> [{ personId, name, via, relation }]` (internal) and `social:mutualsFor { personId }` (public, adds `hue`, `platforms`, `demo`).
- `social:draftDm { personId, text?, toolkit? } -> { toolkit, url?, draft }` (internal). Without `text` it drafts through `assistant.draftFor`. Never sends.
- `social:seedDemoEdges { userKey?, clear? }` (internal mutation) writes demo edges between seeded contacts, replacing earlier demo edges. `clear: true` removes them.

## Data

- `socialAccounts { ownerId, toolkit, connectedAccountId, status, handle?, at }`, one row per user and toolkit.
- `socialEdges { ownerId, personId, otherPersonId?, otherHandle, toolkit, relation, demo?, at }`. With `otherPersonId` it is contact to contact (`personId` follows / is connected to `otherPersonId`). Without it, the edge is between the contact and the user (`follows` = the user follows the contact, `followed_by` = the contact follows the user).
- `people.socialIds` (toolkit -> platform user id) and `people.handlesVerified` (handle keys confirmed by a connected account).
