import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type TodayFeed = FunctionReturnType<typeof api.feed.today>;
export type ComingUpItem = TodayFeed["comingUp"][number];
export type GiftItem = Extract<ComingUpItem, { type: "gift" }>;
export type BirthdayItem = Extract<ComingUpItem, { type: "birthday" }>;
export type EventItem = Extract<ComingUpItem, { type: "event" }>;
export type UpdateItem = TodayFeed["updates"][number];
export type FeedPerson = ComingUpItem["person"];
