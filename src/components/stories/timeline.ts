import { STYLE_BY_ID, isSpoken, type StoryStyle, type StyleId } from "../../../convex/storyStyles";
import type { ReelData } from "./types";

export type Word = { w: string; s: number; e: number };
export type Turn = { index: number; speaker: string; text: string; caption: string; person: string; beat: string; start: number; end: number; words: Word[] };
export type Timeline = {
  style: StoryStyle;
  mode: "audio" | "speech" | "silent";
  turns: Turn[];
  duration: number;
  overlay: string[];
  title: string;
  names: Record<string, string>;
};

export const splitWords = (s: string) => s.split(/\s+/).filter(Boolean);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const readTime = (s: string) => splitWords(s).length * 0.3;

function spread(words: string[], start: number, end: number): Word[] {
  const total = words.reduce((n, w) => n + w.length + 1, 0) || 1;
  let at = start;
  return words.map((w) => {
    const len = ((w.length + 1) / total) * (end - start);
    const word = { w, s: at, e: at + len };
    at += len;
    return word;
  });
}

export function buildTimeline(reel: ReelData): Timeline | null {
  const script = reel.script;
  if (!script || !script.turns.length) return null;
  const style = STYLE_BY_ID[reel.style as StyleId];
  const base = {
    style,
    overlay: script.overlay,
    title: script.title,
    names: Object.fromEntries([...style.cast.map((c) => [c.id, c.name]), ...script.characters.map((c) => [c.id, c.name])]),
  };
  const turns: Turn[] = [];
  const timings = reel.wordTimings;

  if (isSpoken(style) && reel.audioUrl && timings?.length) {
    script.turns.forEach((t, index) => {
      const timed = timings.filter((w) => w.t === index);
      if (!timed.length) return;
      const shown = splitWords(t.caption);
      const words = shown.length === timed.length ? timed.map((w, k) => ({ w: shown[k], s: w.s, e: w.e })) : timed.map((w) => ({ w: w.w, s: w.s, e: w.e }));
      turns.push({ index, ...t, start: timed[0].s, end: timed[timed.length - 1].e, words });
    });
    return { ...base, mode: "audio", turns, duration: (turns[turns.length - 1]?.end ?? 0) + 0.8 };
  }

  if (isSpoken(style)) {
    let at = 0.3;
    script.turns.forEach((t, index) => {
      const rate = style.cast.find((c) => c.id === t.speaker)?.voice.device.rate ?? 1;
      const len = Math.max(0.6, (t.text.length * 0.068) / rate);
      turns.push({ index, ...t, start: at, end: at + len, words: spread(splitWords(t.caption), at, at + len) });
      at += len + 0.2;
    });
    return { ...base, mode: "speech", turns, duration: at + 0.6 };
  }

  if (style.format === "slides" || style.caption === "timed-hook") {
    let at = 0;
    script.turns.forEach((t, index) => {
      const len =
        style.caption === "screen" && index === 0
          ? 3
          : style.caption === "timed-hook"
            ? Math.max(2.6, 1 + readTime(t.caption))
            : clamp(1.4 + readTime(t.caption + " " + (t.text === t.caption ? "" : t.text)), 2.2, 4.8);
      turns.push({ index, ...t, start: at, end: at + len, words: spread(splitWords(t.caption), at, at + len) });
      at += len;
    });
    return { ...base, mode: "silent", turns, duration: at + 0.4 };
  }

  const duration = clamp(2.5 + readTime(script.overlay.join(" ")), style.seconds[0], style.seconds[1]);
  const step = duration / (script.turns.length + 1);
  script.turns.forEach((t, index) => {
    const start = step * (index + 0.5);
    turns.push({ index, ...t, start, end: start + step, words: spread(splitWords(t.caption), start, start + step) });
  });
  return { ...base, mode: "silent", turns, duration };
}

export function turnAt(tl: Timeline, t: number) {
  let current: Turn | null = null;
  for (const turn of tl.turns) if (turn.start <= t) current = turn;
  return current;
}
