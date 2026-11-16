import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import type { SharedValue } from "react-native-reanimated";

export function VideoReel({ url, paused, muted, onEnd, progress }: { url: string; paused: boolean; muted: boolean; onEnd: () => void; progress: SharedValue<number> }) {
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.audioMixingMode = "doNotMix";
    p.play();
  });
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (player.duration > 0) progress.value = Math.min(1, currentTime / player.duration);
  });
  useEventListener(player, "playToEnd", onEnd);
  return <VideoView testID="reel-video" player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}
