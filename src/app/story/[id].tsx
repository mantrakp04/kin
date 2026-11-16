import { useLocalSearchParams } from "expo-router";
import type { Id } from "../../../convex/_generated/dataModel";
import { Player } from "../../components/stories/Player";

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Player storyId={id as Id<"stories">} />;
}
