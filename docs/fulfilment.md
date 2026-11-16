# Gift fulfilment: Agentcard and RentAHuman

When the user taps **Send gift**, Kin's one agent takes the gift from payment to the doorstep and shows each step as a timeline on the gift card and the chat confirm card. Code: `convex/fulfil.ts` (pipeline, claim page, `fulfil:forGift` query), `convex/payments.ts` (`chargeGift` picks the payment route), `src/components/gift/GiftTimeline.tsx` (stepper and detail sheet).

## Flow

1. **Paid.** The tap is the approval. `agentTools.send_gift` only charges when the current instruction is the structured `{ type: "send_gift", payload: { giftId } }` action. Typed text gets a confirm card and spends nothing. Payment order in `chargeGift`: Agentcard (when `AGENTCARD_ACCESS_TOKEN` is set), then Whop checkout, then simulated. If Whop errors (today it returns 401 because the production key meets `WHOP_ENVIRONMENT=sandbox`), the gift falls back to the demo pipeline, marked "(demo)", instead of failing. A Whop `payment.succeeded` webhook also starts fulfilment.
2. **Card ready.** `POST https://api.agentcard.sh/api/v1/cards { amountCents }` mints a single-use virtual Visa capped at the gift price plus 15% and $8 for tax and shipping, rounded up to whole dollars (a $48 gift gets a $64 limit), and never more than `AGENTCARD_MAX_CENTS` (default 15000). Agentcard's own default per-card maximum is $50, so raise it with Agentcard support or set `AGENTCARD_MAX_CENTS`. Kin stores only the card id, last 4 and limit, never the PAN or CVV. The card auto-closes after one authorization, and Kin closes it after delivery to release any hold.
3. **Waiting for the recipient's address.** Kin mints a random claim token and posts a draft text for the user to send: "Hi Maya, I sent you a little something. Tell me where it should go: <site>/g/<token>". Kin never messages contacts itself. `GET /g/{token}` serves a small Kin-styled form and `POST /g/{token}` stores the address on the order.
4. **Human hired.** With `RENTAHUMAN_API_KEY`, Kin posts a RentAHuman bounty (`POST https://rentahuman.ai/api/bounties`, `x-api-key`, an `Idempotency-Key` per order, `autoAccept: true`, `evidenceTypes: ["photo"]`, fixed `price` from `RENTAHUMAN_BUDGET`, default $40) in the recipient's city. The bounty asks the worker to pick up the prepaid order, gift-wrap it, hand-write the note Kin drafted, and deliver it. The public bounty holds only the city. Kin sends the exact address in the bounty's job chat (`POST /conversations/:id/messages`) once a worker is accepted. The worker is paid from the RentAHuman wallet, never with the card.
5. **Bought, Wrapped, Delivered.** Kin polls every 60 s for up to 2 days: `GET /bounties/:id/applications` for the accepted worker (first name and city), `GET /cards/:id` for the card closing after its one payment (Bought), and `GET /bounties/:id/submissions` for the worker's evidence (Wrapped and Delivered, with the photo when there is one). RentAHuman offers signed webhooks per API key, but polling avoids configuring a webhook secret today. Every step is also posted to the user's Kin thread as an assistant message with action `gift_step`.

Without keys, the same steps run in **demo mode** on a timer: the card after 5 s ("·· 4242", demo), the address auto-claims after 9 s unless the recipient submits the form first, then hired, bought, wrapped and delivered about 7 s apart. Every simulated step ends in "(demo)" and the timeline shows a Demo label.

## Environment variables (Convex)

| Name | Needed for | Notes |
| --- | --- | --- |
| `AGENTCARD_ACCESS_TOKEN` | Live single-use cards | Platform access token from Agentcard client credentials (`agent-cards` CLI). Without it, payment goes to Whop, then demo. |
| `AGENTCARD_MAX_CENTS` | optional | Hard cap per card, default 15000. |
| `RENTAHUMAN_API_KEY` | Live courier | `rah_...` from rentahuman.ai/account/api-keys. The RentAHuman wallet must be funded, or the bounty is created as `pending_deposit`. |
| `RENTAHUMAN_BUDGET` | optional | Worker pay in dollars, default 40. RentAHuman adds an 18% fee. |

Set them with `npx convex env set --env-file ~/.capy/work/convex-deploy.env NAME value`. Whop variables are unchanged.

## Why not mint the card through Keiki

Keiki wraps Agentcard as agent abilities that run inside Keiki's own agent loop: agent wallets (`wallet_authorize_purchase`, which creates a one-time card per purchase intent under a spending policy) and opencommerce (`opencommerce_buy`). Both need a wallet that an operator connects in the Keiki dashboard. Keiki's public REST API (openapi.json) and MCP expose no wallet or card-minting endpoint, and the in-app tap runs in Kin's Convex loop, so the app path can't call them. For iMessage, enable the wallet ability on the deployed `kin` agent and connect an Agentcard wallet in Keiki. Face ID in Keiki Vault then stays the gate and Keiki mints the card. The direct adapter here serves the app.

## Privacy

- The recipient chooses where the gift goes on a private, unguessable link. The address is never returned by any query the app uses (`fulfil:forGift` has no address field), never shown to the user, never put in the public bounty, and is deleted from the order when the step reaches Delivered.
- The claim page sends `noindex`, `no-store` and `no-referrer`. Once claimed or delivered, the link shows a thank-you page and accepts no new address.

## Safety

- The tap is the only approval. Typed text never spends, and on iMessage only a Face ID approval in Keiki Vault does.
- Spend is capped twice: the card limit (price plus headroom, at most `AGENTCARD_MAX_CENTS`) and Agentcard's account limits. The card is single-use and closed after delivery.
- Card details are never stored, never sent to the model, and never given to a human. The worker is paid through RentAHuman.
- Bounty text treats worker messages as task data. Kin never asks workers for card details or passwords.

## Demo and testing

```bash
E=--env-file\ ~/.capy/work/convex-deploy.env
npx convex run $E demo:resetMayaGift '{"userKey":"alex"}'          # also clears the gift's order
npx convex run $E agent:instruct '{"userKey":"alex","action":{"type":"send_gift","payload":{"giftId":"<id>","productId":"<id>"}}}'
npx convex run $E fulfil:forGift '{"userKey":"alex","giftId":"<id>"}'  # timeline; claimUrl opens the address page
```

App testIDs: `gift-timeline` (opens the detail sheet), `gift-step-{paid|card|address|hired|bought|wrapped|delivered}`, `gift-sheet`, `gift-sheet-done`.
