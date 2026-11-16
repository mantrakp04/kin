import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Enter } from "../Enter";
import { Press } from "../Press";
import { Button } from "../ui";
import { font, space } from "../../theme/tokens";
import { Bubbles } from "./Bubbles";
import { light } from "./light";

export function WelcomeStep({ onSync, onSkip }: { onSync: () => void; onSkip: () => void }) {
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox(e.nativeEvent.layout);
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
      <View style={{ flex: 1, marginHorizontal: space.page }} onLayout={onLayout}>
        {box.width > 0 && (
          <Enter index={0}>
            <Bubbles width={box.width} height={box.height} />
          </Enter>
        )}
      </View>
      <View style={{ paddingHorizontal: 28, paddingBottom: insets.bottom + 20, gap: space.lg }}>
        <Enter index={1}>
          <Text style={{ fontFamily: font.serif, fontSize: 40, lineHeight: 46, letterSpacing: -0.8, color: light.text }}>Everyone you know. Everything they're up to.</Text>
        </Enter>
        <Enter index={2} style={{ gap: space.sm, marginTop: space.md }}>
          <Button testID="sync-contacts" label="Sync my contacts" variant="light" size="lg" onPress={onSync} />
          <Press testID="not-now" onPress={onSkip} accessibilityRole="button" accessibilityLabel="Not now" style={{ height: 44, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: light.secondary, fontSize: 15, fontWeight: "600" }}>Not now</Text>
          </Press>
        </Enter>
        <Enter index={3}>
          <Text style={{ color: light.quiet, fontSize: 13, lineHeight: 18, textAlign: "center" }}>Kin only reads public profiles. You choose what you share.</Text>
        </Enter>
      </View>
    </View>
  );
}
