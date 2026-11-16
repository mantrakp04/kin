import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Image, Modal, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { api } from "../../../convex/_generated/api";
import { Press } from "../Press";
import { Button, SectionLabel } from "../ui";
import { useSession } from "../../lib/session";
import { ease } from "../../theme/motion";
import { color, font, radius, shadow, space, type } from "../../theme/tokens";

type Step = { key: string; label: string; detail?: string; at?: number };
type State = "done" | "current" | "todo";

const DOT = 9;
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Dot({ state }: { state: State }) {
  const still = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = state === "current" && !still ? withRepeat(withTiming(0.35, { duration: 1000, easing: ease }), -1, true) : withTiming(1, { duration: 150 });
  }, [state, still]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  const fill = state === "done" ? color.success : state === "current" ? color.ink : "transparent";
  return (
    <Animated.View
      style={[
        { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: fill, borderWidth: state === "todo" ? 1.5 : 0, borderColor: color.edge },
        state === "current" && pulse,
      ]}
    />
  );
}

function StepRow({ step, state, last, big, testID }: { step: Step; state: State; last: boolean; big?: boolean; testID: string }) {
  const rowH = big ? 52 : 26;
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: space.md, minHeight: rowH }}>
      <View style={{ width: DOT, alignItems: "center", paddingTop: big ? 6 : 5 }}>
        <Dot state={state} />
        {!last && <View style={{ flex: 1, width: 1.5, marginTop: 3, backgroundColor: state === "done" ? "rgba(18,136,74,0.35)" : color.hairline }} />}
      </View>
      <View style={{ flex: 1, flexDirection: big ? "column" : "row", gap: big ? 2 : space.sm, paddingBottom: big ? space.md : 0 }}>
        <Text style={[big ? type.bodySmall : { fontSize: 13.5, color: color.ink }, state === "todo" && { color: color.inkQuiet }, state === "current" && { fontWeight: "600" }]} numberOfLines={1}>
          {step.label}
        </Text>
        {step.detail ? (
          <Text style={[type.quiet, !big && { flex: 1, fontSize: 12.5 }]} numberOfLines={big ? 2 : 1}>
            {step.detail}
            {big && step.at ? `  ·  ${time(step.at)}` : ""}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const stateOf = (steps: Step[], current: string, i: number): State => (steps[i].at ? "done" : steps[i].key === current ? "current" : "todo");

export function GiftTimeline({ giftId, style }: { giftId: string; style?: StyleProp<ViewStyle> }) {
  const { userKey } = useSession();
  const order = useQuery(api.fulfil.forGift, { userKey, giftId });
  const [open, setOpen] = useState(false);
  if (!order) return null;
  const steps = order.steps as Step[];
  const demo = steps.some((s) => s.detail?.endsWith("(demo)"));
  return (
    <>
      <Press
        testID="gift-timeline"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Gift progress, open details"
        style={[
          { padding: space.md, paddingTop: space.sm, gap: space.sm, borderRadius: radius.field, borderCurve: "continuous", backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs },
          style,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[type.label, { flex: 1 }]}>{order.current === "done" ? "Delivered" : "On its way"}</Text>
          {demo && <Text style={[type.label, { color: color.ai }]}>Demo</Text>}
        </View>
        <View>
          {steps.map((s, i) => (
            <StepRow key={s.key} step={s} state={stateOf(steps, order.current, i)} last={i === steps.length - 1} testID={`gift-step-${s.key}`} />
          ))}
        </View>
      </Press>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <ScrollView testID="gift-sheet" style={{ flex: 1, backgroundColor: color.gray[1] }} contentContainerStyle={{ padding: space.page, paddingTop: space.xxl, gap: space.xl }}>
          <View style={{ gap: space.xs }}>
            <Text style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: 1.6, fontWeight: "600", color: color.ai }}>KIN{demo ? " · DEMO" : ""}</Text>
            <Text style={[type.title, { fontSize: 34 }]}>{order.recipient ? `${order.recipient}'s gift` : "Gift"}</Text>
            {order.product ? <Text style={[type.body, { color: color.inkSecondary }]}>{order.product}</Text> : null}
          </View>
          <View>
            {steps.map((s, i) => (
              <StepRow key={s.key} big step={s} state={stateOf(steps, order.current, i)} last={i === steps.length - 1} testID={`gift-sheet-step-${s.key}`} />
            ))}
          </View>
          {order.photoUrl ? <Image source={{ uri: order.photoUrl }} style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius.card }} accessibilityLabel="Delivery photo" /> : null}
          <View style={{ gap: space.sm }}>
            <SectionLabel>Note in the card</SectionLabel>
            <Text style={[type.body, { fontFamily: font.serif, fontSize: 18, lineHeight: 26 }]}>{order.note}</Text>
          </View>
          <View style={{ gap: space.sm }}>
            <SectionLabel>How Kin handles it</SectionLabel>
            {order.card ? (
              <Text style={type.bodySmall}>
                Single-use card ·· {order.card.last4}, capped at ${order.card.limitCents ? Math.round(order.card.limitCents / 100) : "—"}. Only Kin's checkout uses it. The courier never sees card details.
              </Text>
            ) : null}
            <Text style={type.bodySmall}>{order.recipient ?? "They"} chose the address on a private link. You won't see it, and it's deleted after delivery.</Text>
            {order.human ? <Text style={type.bodySmall}>{order.human.name} is paid through RentAHuman.</Text> : null}
            <Text style={[type.quiet, { marginTop: space.xs }]}>Your tap on Send gift was the only approval.</Text>
          </View>
          <Button label="Done" variant="raised" onPress={() => setOpen(false)} testID="gift-sheet-done" />
        </ScrollView>
      </Modal>
    </>
  );
}
