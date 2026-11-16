import type { SoundKey } from "../../../convex/storyStyles";

export const BUNDLED: Record<SoundKey, number> = {
  swish: require("../../../assets/stories/swish.wav"),
  pop: require("../../../assets/stories/pop.wav"),
  spin: require("../../../assets/stories/spin.wav"),
  beat101: require("../../../assets/stories/beat101.wav"),
  beat128: require("../../../assets/stories/beat128.wav"),
  pad: require("../../../assets/stories/pad.wav"),
};

export function soundSource(key: SoundKey, library: Record<string, string>) {
  return library[key] ? { uri: library[key] } : BUNDLED[key];
}
