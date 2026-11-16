import { useQuery } from "convex/react";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { Backdrop } from "../components/Backdrop";
import { Press } from "../components/Press";
import { useToast } from "../components/Toast";
import { Button } from "../components/ui";
import { AttachButton } from "../components/share/AttachButton";
import { AudienceRow } from "../components/share/AudienceRow";
import { dark } from "../components/share/dark";
import { useInstruct } from "../lib/agent";
import { useSession } from "../lib/session";
import { backdrops, font, radius, space, type } from "../theme/tokens";

type Audience = "close" | "everyone" | "city";

const FALLBACK: { key: Audience; label: string; count: number; note?: string }[] = [
  { key: "close", label: "Close friends", count: 14 },
  { key: "everyone", label: "Everyone on Kin", count: 212, note: "of your contacts" },
  { key: "city", label: "People in New York", count: 31, note: "contacts" },
];

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)");
}

export default function SharePage() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { userKey } = useSession();
  const me = useQuery(api.users.me, { userKey });
  const audiences = useQuery(api.shares.audiences, { userKey }) ?? FALLBACK;
  const instruct = useInstruct();
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<Audience>("close");
  const [withPlace, setWithPlace] = useState(false);
  const [busy, setBusy] = useState(false);

  const city = me?.city ?? "New York";
  const count = audiences.find((a) => a.key === audience)?.count ?? 0;
  const empty = text.trim().length === 0;

  const submit = async () => {
    if (empty || busy) return;
    setBusy(true);
    try {
      await instruct({ action: { type: "share_update", payload: { text: text.trim(), audience, place: withPlace ? city : undefined } } });
      close();
      toast(`Shared with ${count} people`);
    } catch (e) {
      setBusy(false);
      toast(e instanceof Error ? e.message : "Could not share");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Backdrop colors={backdrops.share} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: space.page, flexDirection: "row", alignItems: "center", height: insets.top + 52 }}>
          <Press testID="share-cancel" onPress={close} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={12}>
            <Text style={{ color: dark.secondary, fontSize: 16 }}>Cancel</Text>
          </Press>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.xl }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[type.label, { color: dark.quiet }]}>New update</Text>
          <TextInput
            testID="share-input"
            value={text}
            onChangeText={setText}
            placeholder="What's new?"
            placeholderTextColor={dark.placeholder}
            multiline
            selectionColor={dark.text}
            style={{ fontFamily: font.serif, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, color: dark.text, minHeight: 130, marginTop: space.md, textAlignVertical: "top" }}
          />
          {withPlace && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={{ flexDirection: "row", marginTop: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.chip, borderCurve: "continuous", backgroundColor: dark.surfaceActive, borderWidth: 1, borderColor: dark.edge }}>
                <Text style={{ color: dark.secondary, fontSize: 12 }}>●</Text>
                <Text testID="share-place" style={{ color: dark.text, fontSize: 14, fontWeight: "600" }}>{city}</Text>
              </View>
            </Animated.View>
          )}
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg }}>
            <AttachButton testID="share-photo" label="Photo" glyph="▢" onPress={() => toast("Photos come in the next build")} />
            <AttachButton testID="share-location" label="Location" glyph="◎" active={withPlace} onPress={() => setWithPlace((v) => !v)} />
          </View>
          <Text style={[type.label, { color: dark.quiet, marginTop: space.xxl + 8, marginBottom: space.sm }]}>Who can see this</Text>
          <View style={{ gap: 4 }}>
            {audiences.map((a) => (
              <AudienceRow
                key={a.key}
                testID={`audience-${a.key}`}
                label={a.label}
                detail={a.note ? `${a.count} ${a.note}` : `${a.count} people`}
                selected={audience === a.key}
                onPress={() => setAudience(a.key)}
              />
            ))}
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: space.page, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.lg) + 4 }}>
          <Button testID="share-submit" variant="light" size="lg" label={busy ? "Sharing" : `Share with ${count} people`} disabled={empty || busy} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
