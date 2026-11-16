import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Text, View, type GestureResponderEvent } from "react-native";
import { color, font } from "../../theme/tokens";

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LETTER_H = 16;

export function LetterIndex({ available, onLetter }: { available: Set<string>; onLetter: (letter: string) => void }) {
  const last = useRef<string | null>(null);
  const pick = (e: GestureResponderEvent) => {
    const i = Math.max(0, Math.min(LETTERS.length - 1, Math.floor(e.nativeEvent.locationY / LETTER_H)));
    const letter = LETTERS[i];
    if (letter === last.current) return;
    last.current = letter;
    Haptics.selectionAsync();
    onLetter(letter);
  };
  return (
    <View
      testID="letter-index"
      style={{ paddingHorizontal: 6 }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        last.current = null;
        pick(e);
      }}
      onResponderMove={pick}
      onResponderRelease={() => (last.current = null)}
    >
      {LETTERS.map((l) => (
        <View key={l} pointerEvents="none" style={{ height: LETTER_H, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: font.mono, fontSize: 10, fontWeight: "600", color: available.has(l) ? color.inkSecondary : color.hairline }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}
