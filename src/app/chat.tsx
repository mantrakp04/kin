import { useQuery } from "convex/react";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { Backdrop } from "../components/Backdrop";
import { Enter } from "../components/Enter";
import { Press } from "../components/Press";
import { useToast } from "../components/Toast";
import { ActivityLine, ChatMessage, KinLabel, UserBubble, type ChatRow } from "../components/chat/ChatMessage";
import { Icon } from "../components/person/Icon";
import { useInstruct } from "../lib/agent";
import { useSession } from "../lib/session";
import { backdrops, color, radius, shadow, space, type } from "../theme/tokens";

const SUGGESTIONS = ["Who's in New York this week?", "What's new with Arjun?", "Draft a congrats text for Priya"];

function back() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export default function Chat() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { userKey } = useSession();
  const rows = useQuery(api.agent.thread, { userKey }) as ChatRow[] | undefined;
  const instruct = useInstruct();
  const [text, setText] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const send = async (value: string) => {
    const t = value.trim();
    if (!t || sending) return;
    setText("");
    setSending(t);
    try {
      await instruct({ text: t });
    } catch {
      setText(t);
      toast("Could not send");
    } finally {
      setSending(null);
    }
  };

  const list = rows ?? [];
  const last = list[list.length - 1];
  const thinking = !!sending || last?.role === "user";
  const empty = rows !== undefined && list.length === 0 && !sending;
  const canSend = text.trim().length > 0 && !sending;

  return (
    <View style={{ flex: 1 }}>
      <Backdrop colors={backdrops.app} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: space.page, paddingBottom: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Press testID="chat-back" accessibilityRole="button" accessibilityLabel="Today" haptic onPress={back} style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 34, paddingRight: space.sm }}>
            <Icon name="back" size={20} />
            <Text style={{ fontSize: 16, fontWeight: "500", color: color.ink }}>Today</Text>
          </Press>
          <KinLabel>ASK KIN</KinLabel>
          <View style={{ width: 70 }} />
        </View>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.lg, gap: space.md, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {empty ? (
            <View style={{ flex: 1, justifyContent: "flex-end", gap: space.md }}>
              <Enter index={0} style={{ gap: space.xs, marginBottom: space.md }}>
                <Text style={type.title}>Ask Kin</Text>
                <Text style={[type.bodySmall, { color: color.inkSecondary }]}>About your people, your week, or something to send.</Text>
              </Enter>
              {SUGGESTIONS.map((s, i) => (
                <Enter key={s} index={i + 1} style={{ alignSelf: "flex-start" }}>
                  <Press
                    testID={`chat-suggestion-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={s}
                    haptic
                    onPress={() => send(s)}
                    style={{ paddingHorizontal: space.lg, paddingVertical: 10, borderRadius: radius.capsule, borderCurve: "continuous", backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs }}
                  >
                    <Text style={[type.bodySmall, { fontWeight: "500" }]}>{s}</Text>
                  </Press>
                </Enter>
              ))}
            </View>
          ) : (
            list.map((row, i) => (
              <Enter key={row._id} index={0}>
                <View testID={`chat-message-${i}`}>
                  <ChatMessage row={row} />
                </View>
              </Enter>
            ))
          )}
          {sending && !(last?.role === "user" && last.text === sending) ? <UserBubble text={sending} /> : null}
          {thinking ? <ActivityLine text="Thinking" running /> : null}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.page, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md) + 4 }}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Ask Kin"
            placeholderTextColor={color.inkQuiet}
            multiline
            onSubmitEditing={() => send(text)}
            submitBehavior="submit"
            returnKeyType="send"
            style={{
              flex: 1,
              minHeight: 46,
              maxHeight: 128,
              paddingHorizontal: space.lg,
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 16,
              color: color.ink,
              backgroundColor: color.cardSolid,
              borderRadius: radius.field,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: color.cardEdge,
              boxShadow: shadow.xs,
            }}
          />
          <Press
            testID="chat-send"
            accessibilityRole="button"
            accessibilityLabel="Send"
            haptic
            scale={0.94}
            onPress={canSend ? () => send(text) : undefined}
            style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: color.ink, boxShadow: shadow.lg, opacity: canSend ? 1 : 0.35 }}
          >
            <Text style={{ color: color.white, fontSize: 19, fontWeight: "700", marginTop: -2 }}>↑</Text>
          </Press>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
