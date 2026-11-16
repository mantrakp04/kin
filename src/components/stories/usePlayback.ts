import { useAudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { soundSource } from "./sounds";
import { turnAt, type Timeline } from "./timeline";

const MUSIC_VOLUME: Record<string, number> = { beat101: 0.55, beat128: 0.4, pad: 0.3 };

export function usePlayback({
  tl,
  audioUrl,
  sounds,
  paused,
  onEnd,
}: {
  tl: Timeline;
  audioUrl: string | null;
  sounds: Record<string, string>;
  paused: boolean;
  onEnd: () => void;
}) {
  const [time, setTime] = useState(0);
  const voice = useAudioPlayer(tl.mode === "audio" ? audioUrl : null);
  const music = useAudioPlayer(tl.style.music === "none" ? null : soundSource(tl.style.music, sounds));
  const sfx = useAudioPlayer(soundSource(tl.style.format === "phonetic" ? "spin" : tl.style.format === "dialogue" || tl.style.format === "rap" ? "pop" : "swish", sounds));
  const swish = useAudioPlayer(tl.style.sfx === "swish" ? soundSource("swish", sounds) : null);
  const state = useRef({ base: 0, t: 0, spoken: -1, speaking: false, ended: false, person: "", turn: -1 });
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    music.loop = true;
    music.volume = MUSIC_VOLUME[tl.style.music] ?? 0;
    sfx.volume = 0.6;
    swish.volume = 0.7;
  }, [music, sfx, swish, tl.style.music]);

  useEffect(() => () => void Speech.stop(), []);

  useEffect(() => {
    const s = state.current;
    if (paused) {
      voice.pause();
      music.pause();
      if (tl.mode === "speech") {
        if (Platform.OS === "ios") Speech.pause();
        else {
          Speech.stop();
          s.spoken = (turnAt(tl, s.t)?.index ?? 0) - 1;
          s.speaking = false;
        }
      }
      return;
    }
    s.base = Date.now() - s.t * 1000;
    if (tl.mode === "speech" && Platform.OS === "ios" && s.speaking) Speech.resume();

    const say = (k: number) => {
      const turn = tl.turns[k];
      const device = (tl.style.cast.find((c) => c.id === turn.speaker) ?? tl.style.cast[0]).voice.device;
      s.spoken = k;
      s.speaking = true;
      Speech.speak(turn.text, {
        pitch: device.pitch,
        rate: device.rate * (Platform.OS === "ios" ? 0.55 : 1),
        language: device.language,
        onBoundary: (e: { charIndex?: number }) => {
          if (typeof e?.charIndex !== "number" || s.spoken !== k) return;
          const target = turn.start + (turn.end - turn.start) * (e.charIndex / Math.max(1, turn.text.length));
          if (target > s.t) s.base = Date.now() - target * 1000;
        },
        onDone: () => {
          if (s.spoken !== k) return;
          s.speaking = false;
          const next = tl.turns[k + 1];
          const resume = next ? Math.max(s.t, Math.min(next.start, s.t + 0.25)) : Math.max(s.t, turn.end);
          s.base = Date.now() - resume * 1000;
        },
      });
    };

    let frame = 0;
    const tick = () => {
      if (tl.mode === "audio") {
        if (!voice.isLoaded) s.base = Date.now() - s.t * 1000;
        else if (voice.playing) s.base = Date.now() - voice.currentTime * 1000;
        else if (s.t < voice.duration - 0.1) voice.play();
      }
      if (tl.style.music !== "none" && music.isLoaded && !music.playing) music.play();
      let t = (Date.now() - s.base) / 1000;
      if (tl.mode === "speech") {
        const turn = turnAt(tl, t);
        if (turn && turn.index > s.spoken) say(turn.index);
        const live = tl.turns[s.spoken];
        if (s.speaking && live && t > live.end) {
          t = live.end;
          s.base = Date.now() - t * 1000;
        }
      }
      s.t = t;
      const turn = turnAt(tl, t);
      if (turn && turn.index !== s.turn) {
        s.turn = turn.index;
        if (tl.style.format === "dialogue" || tl.style.format === "rap" || (tl.style.format === "phonetic" && turn.beat === "drop")) {
          sfx.seekTo(0);
          sfx.play();
        }
      }
      if (turn?.person && turn.person !== s.person) {
        s.person = turn.person;
        if (tl.style.sfx === "swish") {
          swish.seekTo(0);
          swish.play();
        }
      }
      setTime(t);
      if (t >= tl.duration && !s.ended) {
        s.ended = true;
        endRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, tl, voice, music, sfx, swish]);

  return time;
}

