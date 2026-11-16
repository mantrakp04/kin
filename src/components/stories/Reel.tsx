import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SceneBackground } from "./Background";
import { Captions } from "./Captions";
import { Cast } from "./Cast";
import { Pictures } from "./Pictures";
import { Slides } from "./Slides";
import { buildTimeline, turnAt, type Timeline } from "./timeline";
import type { ReelData, StoryItem } from "./types";
import { usePlayback } from "./usePlayback";

export function Reel({ reel, items, sounds, paused, onEnd, progress }: { reel: ReelData; items: StoryItem[]; sounds: Record<string, string>; paused: boolean; onEnd: () => void; progress: SharedValue<number> }) {
  const tl = useMemo(() => buildTimeline(reel), [reel]);
  if (!tl) return null;
  return <Playing tl={tl} reel={reel} items={items} sounds={sounds} paused={paused} onEnd={onEnd} progress={progress} />;
}

function Playing({ tl, reel, items, sounds, paused, onEnd, progress }: { tl: Timeline; reel: ReelData; items: StoryItem[]; sounds: Record<string, string>; paused: boolean; onEnd: () => void; progress: SharedValue<number> }) {
  const t = usePlayback({ tl, audioUrl: reel.audioUrl, sounds, paused, onEnd });
  const turn = turnAt(tl, t);
  useEffect(() => {
    progress.value = Math.min(1, t / tl.duration);
  }, [t, tl.duration, progress]);
  return (
    <View testID={"reel-" + reel.style} style={StyleSheet.absoluteFill}>
      <SceneBackground style={tl.style} drop={turn?.beat === "drop" || (tl.style.background.scene === "cow-spin" && t > 2)} />
      <Slides tl={tl} turn={turn} items={items} />
      <Cast tl={tl} turn={turn} t={t} />
      <Pictures tl={tl} turn={turn} t={t} items={items} />
      <Captions tl={tl} t={t} turn={turn} items={items} />
    </View>
  );
}
