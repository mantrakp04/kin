import { useMutation, useQuery } from "convex/react";
import { Contact, requestPermissionsAsync } from "expo-contacts";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Share, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { AgentApps } from "../components/agent/AgentApps";
import { AgentInbox } from "../components/agent/AgentInbox";
import { AgentPreview } from "../components/agent/AgentPreview";
import { AgentShares } from "../components/agent/AgentShares";
import { PersonaEditor } from "../components/agent/PersonaEditor";
import { QrCode } from "../components/agent/QrCode";
import { Enter } from "../components/Enter";
import { Screen } from "../components/Screen";
import { useToast } from "../components/Toast";
import { Avatar, Button, Card, IconButton, SectionLabel } from "../components/ui";
import { useSession } from "../lib/session";
import { color, radius, space, type } from "../theme/tokens";

function vcard(name: string, role: string, url: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const given = parts.slice(0, parts.length > 1 ? -1 : 1).join(" ");
  return ["BEGIN:VCARD", "VERSION:3.0", `N:${last};${given};;;`, `FN:${name}`, `TITLE:${role}`, `item1.URL:${url}`, "item1.X-ABLabel:Kin agent", `NOTE:Ask my Kin agent: ${url}`, "END:VCARD", ""].join("\r\n");
}

export default function AgentScreen() {
  const toast = useToast();
  const { userKey } = useSession();
  const me = useQuery(api.users.me, { userKey });
  const ensureShare = useMutation(api.publicAgent.ensureShare);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    ensureShare({ userKey })
      .then((s) => setUrl(s.url ?? (process.env.EXPO_PUBLIC_CONVEX_SITE_URL ? `${process.env.EXPO_PUBLIC_CONVEX_SITE_URL}/a/${s.token}` : null)))
      .catch(() => toast("Could not load your link"));
  }, [userKey]);

  const first = me?.name.split(" ")[0] ?? "";

  const shareLink = () => {
    if (!url) return;
    Share.share({ message: `Ask my Kin agent: ${url}`, url }).catch(() => {});
  };

  const addToCard = async () => {
    if (!url) return;
    try {
      const perm = await requestPermissionsAsync();
      if (!perm.granted) return toast("Kin needs access to Contacts for this");
      const contact = await Contact.presentPicker();
      if (!contact) return;
      await contact.addUrlAddress({ label: "Kin agent", url });
      toast("Agent link added to that card");
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : "Could not update the card");
    }
  };

  const shareVcard = async () => {
    if (!url || !me) return;
    try {
      const file = new File(Paths.cache, `${me.name}.vcf`);
      if (file.exists) file.delete();
      file.create();
      file.writeSync(vcard(me.name, me.role, url));
      await Share.share({ url: file.uri });
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : "Could not make the card");
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/you"));

  return (
    <Screen dock={false}>
      <IconButton label="Back" onPress={back}>
        <Text testID="agent-back" style={{ fontSize: 22, lineHeight: 24, color: color.ink, marginTop: -2 }}>‹</Text>
      </IconButton>

      <Enter index={0} style={{ marginTop: space.xl, gap: space.xs }}>
        <SectionLabel>Share like a contact</SectionLabel>
        <Text style={type.title}>Your agent</Text>
        <Text style={[type.bodySmall, { color: color.inkSecondary }]}>It knows your work, talks like you, and finds a time to meet. It never shares your contacts or anything private.</Text>
      </Enter>

      <Enter index={1} style={{ marginTop: space.xl }}>
        <Card style={{ padding: space.xl, alignItems: "center", gap: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, alignSelf: "stretch" }}>
            {me ? <Avatar name={me.name} hue={me.hue} size={44} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.rowName}>{me?.name ?? " "}</Text>
              <Text style={type.quiet}>{me ? `${me.role} · ${me.city}` : " "}</Text>
            </View>
            <View style={{ paddingHorizontal: 10, height: 24, justifyContent: "center", borderRadius: radius.capsule, borderCurve: "continuous", backgroundColor: color.aiSubtle }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: color.ai }}>Kin agent</Text>
            </View>
          </View>
          <View style={{ padding: space.lg, backgroundColor: color.white, borderRadius: radius.card, borderCurve: "continuous", borderWidth: 1, borderColor: color.cardEdge }}>
            {url ? <QrCode testID="agent-qr" value={url} size={212} /> : <View testID="agent-qr" style={{ width: 212, height: 212 }} />}
          </View>
          <Text style={[type.quiet, { textAlign: "center" }]}>{url ? `Scan to talk to ${first}'s agent` : "Making your link"}</Text>
          <Button testID="share-agent" label="Share link" variant="ink" size="lg" disabled={!url} onPress={shareLink} style={{ alignSelf: "stretch" }} />
          <Text style={[type.quiet, { textAlign: "center" }]}>Hold phones together? Pick AirDrop in the share sheet.</Text>
        </Card>
      </Enter>

      <Enter index={2} style={{ marginTop: space.lg }}>
        <Card style={{ padding: space.lg, gap: space.md }}>
          <SectionLabel>On your contact card</SectionLabel>
          <Text style={[type.bodySmall, { color: color.inkSecondary }]}>
            iPhone doesn't let apps edit your own card directly. Pick your card (the one marked "me") and Kin adds the agent link, so NameDrop and AirDropped contacts carry it.
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button testID="agent-add-to-card" label="Add to my contact card" variant="raised" size="sm" disabled={!url} onPress={addToCard} />
            <Button testID="agent-vcard" label="Share as contact" variant="quiet" size="sm" disabled={!url} onPress={shareVcard} />
          </View>
        </Card>
      </Enter>

      <Enter index={3} style={{ marginTop: space.lg }}>
        <AgentInbox />
      </Enter>

      <Enter index={4} style={{ marginTop: space.lg }}>
        <AgentPreview />
      </Enter>

      <Enter index={5} style={{ marginTop: space.lg }}>
        <AgentApps />
      </Enter>

      <Enter index={6} style={{ marginTop: space.lg }}>
        <PersonaEditor />
      </Enter>

      <Enter index={7} style={{ marginTop: space.lg }}>
        <AgentShares />
      </Enter>
    </Screen>
  );
}
