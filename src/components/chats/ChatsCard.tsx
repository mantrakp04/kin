import { useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { useSession } from "../../lib/session";
import { space, type } from "../../theme/tokens";
import { Button, Card, SectionLabel } from "../ui";
import { ConnectWhatsAppSheet } from "./ConnectWhatsAppSheet";

export function ChatsCard() {
  const { userKey } = useSession();
  const status = useQuery(api.chats.status, { userKey });
  const [connecting, setConnecting] = useState(false);
  const line = status?.line ? `${status.line}${status.sources.length ? ` · ${status.sources.join(" and ")}` : ""}` : "Import chats so Kin knows who you actually talk to.";

  return (
    <Card style={{ padding: space.lg, gap: space.md }}>
      <SectionLabel>Chats</SectionLabel>
      <Text testID="chats-status" style={type.bodySmall}>
        {line}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button testID="chats-connect-whatsapp" label={status?.bridge ? "WhatsApp linked" : "Connect WhatsApp"} variant="ink" size="sm" onPress={() => setConnecting(true)} />
        <Button testID="chats-import" label="Import WhatsApp chat" variant="raised" size="sm" onPress={() => router.push("/import")} />
        <Button testID="chats-import-imessage" label="Import iMessage" variant="raised" size="sm" onPress={() => router.push({ pathname: "/import", params: { kind: "imessage" } })} />
      </View>
      <ConnectWhatsAppSheet visible={connecting} onClose={() => setConnecting(false)} />
    </Card>
  );
}
