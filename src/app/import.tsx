import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useChatImport, type ImportResult } from "../components/chats/useChatImport";
import { Enter } from "../components/Enter";
import { Screen } from "../components/Screen";
import { useToast } from "../components/Toast";
import { useSession } from "../lib/session";
import { Button, Card, IconButton, SectionLabel } from "../components/ui";
import { color, radius, space, type } from "../theme/tokens";


function summary(r: ImportResult) {
  const n = r.messages.toLocaleString("en-US");
  return `Imported ${n} messages from ${r.chats} ${r.chats === 1 ? "chat" : "chats"}${r.groups ? `, ${r.groups} of them groups` : ""}.`;
}

export default function ImportChats() {
  const { file, kind } = useLocalSearchParams<{ file?: string; kind?: string }>();
  const toast = useToast();
  const { userKey } = useSession();
  const { run, busy } = useChatImport();
  const [result, setResult] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  const importFiles = async (files: Array<{ uri: string; name?: string }>) => {
    setResult(null);
    try {
      const r = await run(files);
      setResult(`${summary(r)} Kin is working out who you talk to most.`);
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].slice(0, 90) : "Could not import that file");
    }
  };

  useEffect(() => {
    if (!file || handled.current === file) return;
    handled.current = file;
    importFiles([{ uri: decodeURIComponent(file) }]);
  }, [file]);

  const pick = async (imessage: boolean) => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: imessage ? "*/*" : ["text/plain", "application/zip", "application/x-zip-compressed"],
      multiple: !imessage,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    importFiles(picked.assets.map((a) => ({ uri: a.uri, name: a.name })));
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/you"));

  return (
    <Screen dock={false}>
      <IconButton label="Back" onPress={back}>
        <Text style={{ fontSize: 22, lineHeight: 24, color: color.ink, marginTop: -2 }}>‹</Text>
      </IconButton>
      <Enter index={0} style={{ marginTop: space.xl, gap: space.sm }}>
        <Text style={type.title}>Import chats</Text>
        <Text style={[type.body, { color: color.inkSecondary }]}>Kin reads text only, keeps the last 2,000 messages per chat, and uses them to see who you talk to. Photos and voice notes never leave your phone.</Text>
      </Enter>

      {(busy || result) && (
        <Enter index={1} style={{ marginTop: space.xl }}>
          <Card style={{ padding: space.lg }}>
            <Text testID="chats-import-result" style={type.bodySmall}>
              {busy ? `${busy} your chats` : result}
            </Text>
          </Card>
        </Enter>
      )}

      <Enter index={2} style={{ marginTop: space.xl }}>
        <Card style={{ padding: space.lg, gap: space.md }}>
          <SectionLabel>WhatsApp</SectionLabel>
          <Text style={type.bodySmall}>In WhatsApp, open a chat, tap its name, then Export chat and Without media. Pick Kin in the share sheet, or save it to Files and choose it here.</Text>
          <Button testID="chats-pick-whatsapp" label="Choose export" variant={kind === "imessage" ? "raised" : "ink"} disabled={!!busy} onPress={() => pick(false)} style={{ alignSelf: "flex-start" }} />
        </Card>
      </Enter>

      <Enter index={3} style={{ marginTop: space.lg }}>
        <Card style={{ padding: space.lg, gap: space.md }}>
          <SectionLabel>iMessage</SectionLabel>
          <Text style={type.bodySmall}>iPhone keeps Messages private, so import from your Mac. Give Terminal Full Disk Access, then run this in the Kin folder:</Text>
          <View style={{ padding: space.md, borderRadius: radius.chip, borderCurve: "continuous", backgroundColor: color.hairline }}>
            <Text selectable style={{ fontFamily: "ui-monospace", fontSize: 12.5, color: color.ink }}>
              {`npx tsx scripts/imessage/sync.ts --user ${userKey}`}
            </Text>
          </View>
          <Text style={type.bodySmall}>Or copy ~/Library/Messages/chat.db to iCloud Drive and choose it here.</Text>
          <Button testID="chats-pick-chatdb" label="Choose chat.db" variant={kind === "imessage" ? "ink" : "raised"} disabled={!!busy} onPress={() => pick(true)} style={{ alignSelf: "flex-start" }} />
        </Card>
      </Enter>
    </Screen>
  );
}
