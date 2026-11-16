import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { useSession } from "../../lib/session";
import { color, radius, shadow, space, type } from "../../theme/tokens";
import { useToast } from "../Toast";
import { Button, SectionLabel } from "../ui";

const fieldStyle = {
  minHeight: 44,
  paddingHorizontal: 14,
  paddingVertical: 11,
  borderRadius: radius.field,
  borderCurve: "continuous" as const,
  backgroundColor: "rgba(255,255,255,0.7)",
  borderWidth: 1,
  borderColor: color.cardEdge,
  boxShadow: "inset 0 1px 2px 0 rgba(27,26,34,0.05)",
  fontSize: 17,
  color: color.ink,
};

export function ConnectWhatsAppSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { userKey } = useSession();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const connect = useAction(api.chats.connectWhatsApp);
  const status = useAction(api.chats.whatsAppStatus);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCode(null);
    setState(null);
    status({ userKey }).then((s) => setState(s.state)).catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (!visible || !code || state === "connected") return;
    const timer = setInterval(() => {
      status({ userKey })
        .then((s) => setState(s.state))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [visible, code, state]);

  const getCode = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const out = await connect({ userKey, phone });
      setCode(out.code);
      setState("pairing");
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].replace(/^.*Uncaught Error: /, "").slice(0, 90) : "Could not reach WhatsApp");
    }
    setLoading(false);
  };

  const connected = state === "connected";
  const shown = code ? `${code.slice(0, 4)}-${code.slice(4)}` : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(27,26,34,0.18)" }} />
        <View
          testID="whatsapp-sheet"
          style={{ backgroundColor: color.cardSolid, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderCurve: "continuous", boxShadow: shadow.dock, paddingTop: space.sm, paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.lg, gap: space.lg }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: color.edge }} />
          <Text style={[type.name, { fontSize: 30 }]}>Connect WhatsApp</Text>
          {connected ? (
            <>
              <Text testID="whatsapp-connected" style={type.body}>
                WhatsApp is linked. Kin is syncing your chats, text only, and will keep up with new messages.
              </Text>
              <Button label="Done" variant="ink" size="lg" onPress={onClose} />
            </>
          ) : shown ? (
            <>
              <View style={{ gap: space.sm }}>
                <SectionLabel>Your code</SectionLabel>
                <Text testID="whatsapp-code" selectable style={{ fontFamily: "ui-monospace", fontSize: 38, letterSpacing: 4, color: color.ink }}>
                  {shown}
                </Text>
              </View>
              <Text style={type.bodySmall}>In WhatsApp, go to Settings, Linked devices, Link a device, then tap Link with phone number instead and enter this code. It works for a few minutes.</Text>
              <Text style={type.quiet}>Waiting for WhatsApp</Text>
              <Button label="Get a new code" variant="raised" onPress={getCode} disabled={loading} />
            </>
          ) : (
            <>
              <Text style={type.bodySmall}>Kin links as a device on your WhatsApp, like WhatsApp Web, and reads message text to see who you talk to. It never sends anything.</Text>
              <TextInput testID="whatsapp-phone" value={phone} onChangeText={setPhone} placeholder="Your number, e.g. +1 415 555 0123" placeholderTextColor={color.inkQuiet} keyboardType="phone-pad" autoComplete="tel" style={fieldStyle} />
              <Button testID="whatsapp-get-code" label={loading ? "Getting code" : "Get code"} variant="ink" size="lg" disabled={loading || phone.replace(/\D/g, "").length < 8} onPress={getCode} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
