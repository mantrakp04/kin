import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type StoryData = NonNullable<FunctionReturnType<typeof api.stories.get>>;
export type ReelData = StoryData["reels"][number];
export type StoryItem = StoryData["items"][number];
