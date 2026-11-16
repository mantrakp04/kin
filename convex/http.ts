import { httpRouter } from "convex/server";
import { whopWebhook } from "./payments";
import { keikiTurn } from "./agent";
import { ingestHttp } from "./chats";
import { agentGet, agentOptions, agentPost } from "./publicAgent";
import { claimGet, claimPost } from "./fulfil";
import { draftMessageTool, getPerson, getToday, identity, previewSendGift, sendGift, setRsvp, suggestGiftTool, whoIsIn } from "./keiki";

const http = httpRouter();

http.route({ path: "/whop/webhook", method: "POST", handler: whopWebhook });

http.route({ path: "/keiki/identity", method: "POST", handler: identity });
http.route({ path: "/keiki/get_today", method: "POST", handler: getToday });
http.route({ path: "/keiki/get_person", method: "POST", handler: getPerson });
http.route({ path: "/keiki/who_is_in", method: "POST", handler: whoIsIn });
http.route({ path: "/keiki/suggest_gift", method: "POST", handler: suggestGiftTool });
http.route({ path: "/keiki/preview_send_gift", method: "POST", handler: previewSendGift });
http.route({ path: "/keiki/send_gift", method: "POST", handler: sendGift });
http.route({ path: "/keiki/set_rsvp", method: "POST", handler: setRsvp });
http.route({ path: "/keiki/draft_message", method: "POST", handler: draftMessageTool });
http.route({ path: "/keiki/turn", method: "POST", handler: keikiTurn });
http.route({ path: "/chats/ingest", method: "POST", handler: ingestHttp });

http.route({ pathPrefix: "/a/", method: "GET", handler: agentGet });
http.route({ pathPrefix: "/a/", method: "POST", handler: agentPost });
http.route({ pathPrefix: "/a/", method: "OPTIONS", handler: agentOptions });

http.route({ pathPrefix: "/g/", method: "GET", handler: claimGet });
http.route({ pathPrefix: "/g/", method: "POST", handler: claimPost });

export default http;
