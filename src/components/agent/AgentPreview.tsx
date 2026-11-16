import { useAction } from "convex/react";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Press } from "../Press";
import { Card, SectionLabel } from "../ui";
import { useSession } from "../../lib/session";
import { color, radius, shadow, space, type } from "../../theme/tokens";

type Line = { role: "guest" | "agent"; text: string };
const TRY = ["What are you working on?", "When are you free next week?", "What's Maya's phone number?"];

export function AgentPreview() {
  const { userKey } = useSession();
  const preview = useAction(api.publicAgent.preview);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (value: string) => {
    const t = value.trim();
    if (!t || busy) return;
    const history = lines.slice(-12);
    setText("");
    setLines((l) => [...l, { role: "guest", text: t }]);
    setBusy(true);
    try {
      const r = await preview({ userKey, text: t, history });
      const times = r.slots.length ? "\n" + r.slots.slice(0, 4).map((s) => s.label).join(" · ") : "";
      setLines((l) => [...l, { role: "agent", text: r.reply + times }]);
    } catch {
      setLines((l) => [...l, { role: "agent", text: "Couldn't reach your agent. Try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ padding: space.lg, gap: space.md }}>
      <SectionLabel>Try your agent</SectionLabel>
      <Text style={[type.bodySmall, { color: color.inkSecondary }]}>Talk to it the way a new contact would. Nothing is booked or sent from here.</Text>
      {lines.length === 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {TRY.map((q, i) => (
            <Press key={q} testID={`agent-preview-suggestion-${i}`} accessibilityRole="button" accessibilityLabel={q} haptic onPress={() => send(q)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.capsule, borderCurve: "continuous", backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: color.ink }}>{q}</Text>
            </Press>
          ))}
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {lines.map((l, i) =>
            l.role === "guest" ? (
              <View key={i} style={{ alignSelf: "flex-end", maxWidth: "86%", backgroundColor: color.ink, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, borderBottomRightRadius: 6, borderCurve: "continuous" }}>
                <Text style={{ color: color.white, fontSize: 15, lineHeight: 20 }}>{l.text}</Text>
              </View>
            ) : (
              <View key={i} style={{ alignSelf: "flex-start", maxWidth: "92%", gap: 4 }}>
                <Text style={[type.label, { color: color.ai }]}>Your agent</Text>
                <Text style={{ fontSize: 15, lineHeight: 21, color: color.ink }}>{l.text}</Text>
              </View>
            ),
          )}
          {busy ? <Text style={type.quiet}>Thinking</Text> : null}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
        <TextInput
          testID="agent-preview-input"
          value={text}
          onChangeText={setText}
          placeholder="Ask as a guest"
          placeholderTextColor={color.inkQuiet}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
          style={{ flex: 1, height: 42, paddingHorizontal: space.md, fontSize: 15.5, color: color.ink, backgroundColor: color.cardSolid, borderRadius: radius.field, borderCurve: "continuous", borderWidth: 1, borderColor: color.cardEdge }}
        />
        <Press testID="agent-preview-send" accessibilityRole="button" accessibilityLabel="Send" haptic scale={0.94} onPress={() => send(text)} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: color.ink, opacity: text.trim() && !busy ? 1 : 0.35 }}>
          <Text style={{ color: color.white, fontSize: 18, fontWeight: "700", marginTop: -2 }}>↑</Text>
        </Press>
      </View>
    </Card>
  );
}
