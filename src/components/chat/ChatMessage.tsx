import { useEffect, useState } from "react";
import { Linking, Share, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import { useToast } from "../Toast";
import { Button, styles as ui } from "../ui";
import { useSendGift } from "../today/sendGift";
import { GiftTimeline } from "../gift/GiftTimeline";
import { ease } from "../../theme/motion";
import { color, font, radius, shadow, space, type } from "../../theme/tokens";

export type ChatRow = {
  _id: string;
  role: "user" | "assistant" | "tool" | "event";
  text: string;
  action: { type: string; payload: any } | null;
  status: "pending" | "running" | "done" | "error" | null;
};

export function KinLabel({ children = "KIN" }: { children?: string }) {
  return <Text style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: 1.6, fontWeight: "600", color: color.ai }}>{children}</Text>;
}

export function ActivityLine({ text, running, failed }: { text: string; running?: boolean; failed?: boolean }) {
  const still = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = running && !still ? withRepeat(withTiming(0.4, { duration: 900, easing: ease }), -1, true) : withTiming(1, { duration: 150 });
  }, [running, still]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }, style]}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: running ? color.ai : color.inkQuiet }} />
      <Text style={[type.quiet, running && { color: color.inkSecondary }]}>
        {text}
        {failed ? " · didn't work" : ""}
      </Text>
    </Animated.View>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "82%", backgroundColor: color.ink, borderRadius: 22, borderCurve: "continuous", paddingHorizontal: space.lg, paddingVertical: 11, boxShadow: shadow.lg }}>
      <Text style={[type.body, { color: color.white }]}>{text}</Text>
    </View>
  );
}

function KinCard({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={[ui.card, { alignSelf: "flex-start", maxWidth: "94%", padding: space.lg, paddingTop: space.md, gap: space.sm }]}>
      <KinLabel>{label}</KinLabel>
      {children}
    </View>
  );
}

function ConfirmGift({ text, payload }: { text: string; payload: any }) {
  const send = useSendGift();
  const toast = useToast();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const onPress = async () => {
    if (state !== "idle") return;
    setState("busy");
    try {
      await send(payload.giftId, payload.productId);
      setState("done");
    } catch {
      setState("idle");
      toast("Could not start checkout");
    }
  };
  return (
    <KinCard>
      <Text style={type.body}>{text}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs }}>
        <Text style={[type.quiet, { flex: 1 }]} numberOfLines={1}>
          {typeof payload.price === "number" ? `$${Math.round(payload.price)}` : ""}
        </Text>
        <Button label={state === "busy" ? "Sending" : state === "done" ? "Done" : "Send gift"} variant="ink" size="sm" disabled={state !== "idle"} onPress={onPress} testID="chat-send-gift" />
      </View>
      {typeof payload.giftId === "string" && <GiftTimeline giftId={payload.giftId} style={{ marginTop: space.xs }} />}
    </KinCard>
  );
}

async function copy(text: string, toast: (t: string) => void) {
  try {
    const Clipboard = require("expo-clipboard") as typeof import("expo-clipboard");
    await Clipboard.setStringAsync(text);
    toast("Copied");
  } catch {
    await Share.share({ message: text });
  }
}

function Draft({ text, payload }: { text: string; payload: any }) {
  const toast = useToast();
  const options: string[] = Array.isArray(payload.options) ? payload.options : [];
  const phone = typeof payload.phone === "string" ? payload.phone.replace(/[^+\d]/g, "") : "";
  const dm = payload.dm as { toolkit: string; url?: string } | undefined;
  const network = dm?.toolkit === "twitter" ? "X" : dm?.toolkit === "linkedin" ? "LinkedIn" : dm?.toolkit === "instagram" ? "Instagram" : null;
  return (
    <KinCard>
      <Text style={type.body}>{text}</Text>
      {options.map((option, i) => (
        <View key={i} style={{ marginTop: space.xs, padding: space.md, gap: space.md, borderRadius: radius.field, borderCurve: "continuous", backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs }}>
          <Text selectable style={type.bodySmall}>
            {option}
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button label="Copy" variant="raised" size="sm" onPress={() => copy(option, toast)} testID={`draft-copy-${i}`} />
            <Button label="Open Messages" variant="ink" size="sm" onPress={() => Linking.openURL(`sms:${phone}&body=${encodeURIComponent(option)}`)} testID={`draft-messages-${i}`} />
            {dm?.url && network && i === 0 ? <Button label={`Open ${network}`} variant="quiet" size="sm" onPress={() => Linking.openURL(dm.url!)} /> : null}
          </View>
        </View>
      ))}
    </KinCard>
  );
}

export function ChatMessage({ row }: { row: ChatRow }) {
  if (row.role === "user") return <UserBubble text={row.text} />;
  if (row.role === "tool") return <ActivityLine text={row.text} running={row.status === "running"} failed={row.status === "error"} />;
  const action = row.action;
  if (action?.type === "confirm_send_gift") return <ConfirmGift text={row.text} payload={action.payload ?? {}} />;
  if (action?.type === "draft") return <Draft text={row.text} payload={action.payload ?? {}} />;
  if (action?.type === "gift_step") return <ActivityLine text={row.text} />;
  if (action?.type === "open_url" && typeof action.payload?.url === "string") {
    return (
      <KinCard>
        <Text style={type.body}>{row.text}</Text>
        <Button label={action.payload.label ?? "Open checkout"} variant="ink" size="sm" style={{ alignSelf: "flex-start", marginTop: space.xs }} onPress={() => WebBrowser.openBrowserAsync(action.payload.url)} testID="chat-open-url" />
      </KinCard>
    );
  }
  return (
    <KinCard label={row.role === "event" ? "KIN · TODAY" : "KIN"}>
      <Text style={[type.body, row.status === "error" && { color: color.inkSecondary }]}>{row.text}</Text>
    </KinCard>
  );
}
