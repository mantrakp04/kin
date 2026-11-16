import { useMutation, useQuery } from "convex/react";
import { setAudioModeAsync } from "expo-audio";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GestureDetector, useCompetingGestures, useLongPressGesture, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import Animated, { FadeIn, SlideInDown, SlideInUp, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STYLE_BY_ID, type StyleId } from "../../../convex/storyStyles";
import { font } from "../../theme/tokens";
import { Press } from "../Press";
import { Reel } from "./Reel";
import { VideoReel } from "./VideoReel";

function Bar({ state, progress }: { state: "done" | "live" | "todo"; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: (state === "done" ? 100 : state === "live" ? progress.value * 100 : 0) + "%" }));
  return (
    <View style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", backgroundColor: "#FFFFFF" }, fill]} />
    </View>
  );
}

export function Player({ storyId }: { storyId: Id<"stories"> }) {
  const story = useQuery(api.stories.get, { storyId });
  const markSeen = useMutation(api.stories.markSeen);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const still = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);
  const loaded = !!story;
  useEffect(() => {
    if (loaded) markSeen({ storyId }).catch(() => {});
  }, [loaded, storyId, markSeen]);

  const reels = story?.reels.filter((r) => r.status === "ready" && (r.videoUrl || r.script?.turns.length)) ?? [];
  const current = reels[Math.min(index, reels.length - 1)];
  const pending = story ? story.reels.filter((r) => r.status !== "ready" && r.status !== "error").length : 0;

  const close = () => router.back();
  const go = (d: number) => {
    progress.value = 0;
    if (index + d < 0) return setReplay((n) => n + 1);
    if (index + d >= reels.length) return pending ? undefined : close();
    setDir(d);
    setIndex(index + d);
  };
  const tapAt = (x: number) => (current?.videoUrl ? setMuted((m) => !m) : go(x < width * 0.3 ? -1 : 1));
  const swipe = (d: number) => (d < 0 && index === 0 ? close() : go(d));
  const latest = useRef({ tapAt, swipe, close });
  latest.current = { tapAt, swipe, close };
  const onTap = (x: number) => latest.current.tapAt(x);
  const onSwipe = (d: number) => latest.current.swipe(d);

  const tap = useTapGesture({
    onActivate: (e) => {
      "worklet";
      scheduleOnRN(onTap, e.x);
    },
  });
  const hold = useLongPressGesture({
    minDuration: 220,
    onActivate: () => {
      "worklet";
      scheduleOnRN(setPaused, true);
    },
    onFinalize: () => {
      "worklet";
      scheduleOnRN(setPaused, false);
    },
  });
  const pan = usePanGesture({
    minDistance: 12,
    onDeactivate: (e) => {
      "worklet";
      if (e.translationY > 70 || e.velocityY > 900) scheduleOnRN(onSwipe, -1);
      else if (e.translationY < -70 || e.velocityY < -900) scheduleOnRN(onSwipe, 1);
    },
  });
  const gesture = useCompetingGestures(pan, hold, tap);

  const style = current ? STYLE_BY_ID[current.style as StyleId] : null;
  const entering = still ? FadeIn.duration(120) : dir > 0 ? SlideInDown.duration(220) : SlideInUp.duration(220);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View testID="story-player" accessibilityLabel={story ? story.label + " story" : "Story"} style={[{ flex: 1, backgroundColor: "#000", overflow: "hidden" }]}>
        <StatusBar style="light" />
        {current ? (
          <Animated.View key={current._id + ":" + replay} entering={entering} style={StyleSheet.absoluteFill}>
            {current.videoUrl ? (
              <VideoReel url={current.videoUrl} paused={paused} muted={muted} onEnd={() => go(1)} progress={progress} />
            ) : (
              <Reel reel={current} items={story!.items} sounds={story!.sounds} paused={paused} onEnd={() => go(1)} progress={progress} />
            )}
          </Animated.View>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
            {story?.status === "empty" ? (
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 16 }}>Nothing new this day.</Text>
            ) : story?.status === "error" ? (
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 16 }}>This story could not be made.</Text>
            ) : (
              <>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 15 }}>Making this story</Text>
              </>
            )}
          </View>
        )}
        {muted && current?.videoUrl && (
          <Animated.View entering={FadeIn.duration(120)} pointerEvents="none" style={{ position: "absolute", top: insets.top + 64, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.45)" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>Muted</Text>
          </Animated.View>
        )}
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 10, right: 10, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 3 }}>
            {reels.map((r, i) => (
              <Bar key={r._id} state={i < index ? "done" : i === index ? "live" : "todo"} progress={progress} />
            ))}
            {Array.from({ length: pending }, (_, i) => (
              <Bar key={"p" + i} state="todo" progress={progress} />
            ))}
          </View>
          <View pointerEvents="box-none" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4 }}>{story?.label ?? ""}</Text>
              {style && <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4 }}>{style.label}</Text>}
            </View>
            <Press testID="story-close" accessibilityRole="button" accessibilityLabel="Close story" onPress={close} hitSlop={14} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "300", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4 }}>×</Text>
            </Press>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
