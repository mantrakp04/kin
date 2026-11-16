/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agentTools from "../agentTools.js";
import type * as assistant from "../assistant.js";
import type * as cardRules from "../cardRules.js";
import type * as cards from "../cards.js";
import type * as chats from "../chats.js";
import type * as cities from "../cities.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as enrich from "../enrich.js";
import type * as feed from "../feed.js";
import type * as fulfil from "../fulfil.js";
import type * as gifts from "../gifts.js";
import type * as graph from "../graph.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as keiki from "../keiki.js";
import type * as lib from "../lib.js";
import type * as memory from "../memory.js";
import type * as notify from "../notify.js";
import type * as payments from "../payments.js";
import type * as people from "../people.js";
import type * as persona from "../persona.js";
import type * as prompts from "../prompts.js";
import type * as publicAgent from "../publicAgent.js";
import type * as pushTokens from "../pushTokens.js";
import type * as reminders from "../reminders.js";
import type * as rsvps from "../rsvps.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as shares from "../shares.js";
import type * as social from "../social.js";
import type * as stories from "../stories.js";
import type * as storyStyles from "../storyStyles.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agentTools: typeof agentTools;
  assistant: typeof assistant;
  cardRules: typeof cardRules;
  cards: typeof cards;
  chats: typeof chats;
  cities: typeof cities;
  crons: typeof crons;
  demo: typeof demo;
  enrich: typeof enrich;
  feed: typeof feed;
  fulfil: typeof fulfil;
  gifts: typeof gifts;
  graph: typeof graph;
  http: typeof http;
  integrations: typeof integrations;
  keiki: typeof keiki;
  lib: typeof lib;
  memory: typeof memory;
  notify: typeof notify;
  payments: typeof payments;
  people: typeof people;
  persona: typeof persona;
  prompts: typeof prompts;
  publicAgent: typeof publicAgent;
  pushTokens: typeof pushTokens;
  reminders: typeof reminders;
  rsvps: typeof rsvps;
  seed: typeof seed;
  seedData: typeof seedData;
  shares: typeof shares;
  social: typeof social;
  stories: typeof stories;
  storyStyles: typeof storyStyles;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
