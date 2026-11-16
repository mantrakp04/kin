import { useAction, useQuery } from "convex/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { useSession } from "../../lib/session";
import { font, space } from "../../theme/tokens";
import { Enter } from "../Enter";
import { Press } from "../Press";
import { useToast } from "../Toast";
import { Button } from "../ui";
import { light } from "./light";

type Row = { key: string; label: string; detail: string; via: "social" | "apps" | "chats" };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Socials",
    rows: [
      { key: "instagram", label: "Instagram", detail: "Trips, posts and who you follow", via: "social" },
      { key: "linkedin", label: "LinkedIn", detail: "New jobs and moves", via: "social" },
      { key: "twitter", label: "X", detail: "Who you follow and who follows you", via: "social" },
    ],
  },
  {
    title: "Chats",
    rows: [{ key: "chats", label: "WhatsApp and iMessage", detail: "Who you're close to and what's coming up", via: "chats" }],
  },
  {
    title: "Calendar",
    rows: [{ key: "googlecalendar", label: "Google Calendar", detail: "So your Kin agent can find a time", via: "apps" }],
  },
];

export function ConnectStep({ onDone, onImport }: { onDone: () => void; onImport: () => void }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { userKey } = useSession();
  const socials = useQuery(api.social.accounts, { userKey });
  const apps = useQuery(api.integrations.connections, { userKey });
  const socialLink = useAction(api.social.connectLink);
  const socialRefresh = useAction(api.social.refresh);
  const appLink = useAction(api.integrations.connectLink);
  const appRefresh = useAction(api.integrations.refresh);
  const [busy, setBusy] = useState<string | null>(null);

  const isConnected = (row: Row) =>
    row.via === "social" ? !!socials?.find((a) => a.toolkit === row.key)?.connected : row.via === "apps" ? !!apps?.find((a) => a.toolkit === row.key)?.connected : false;

  const connect = async (row: Row) => {
    if (row.via === "chats") return onImport();
    if (busy) return;
    setBusy(row.key);
    try {
      const redirect = Linking.createURL("onboarding");
      const res = row.via === "social" ? await socialLink({ userKey, toolkit: row.key as "twitter" | "instagram" | "linkedin", redirect }) : await appLink({ userKey, toolkit: row.key, redirect });
      if (res.error) {
        toast(row.key === "twitter" ? "X needs its own developer app first" : res.error.split("\n")[0].slice(0, 80));
        return;
      }
      if (res.url) await WebBrowser.openAuthSessionAsync(res.url, redirect);
      const after = row.via === "social" ? await socialRefresh({ userKey }) : await appRefresh({ userKey });
      if (after.connected.includes(row.key)) toast(`${row.label} connected`);
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : "Could not connect");
    } finally {
      setBusy(null);
    }
  };

  let index = 0;
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 24 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: space.xl, gap: space.lg }}>
        <Enter index={index++}>
          <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 1.2, color: light.quiet }}>ONE MORE STEP</Text>
          <Text style={{ fontFamily: font.serif, fontSize: 36, lineHeight: 42, letterSpacing: -0.7, color: light.text, marginTop: space.sm }}>Bring the rest of your world in.</Text>
          <Text style={{ color: light.secondary, fontSize: 15, lineHeight: 21, marginTop: space.sm }}>Kin reads, it never posts or sends. Connect what you like, skip the rest.</Text>
        </Enter>
        {GROUPS.map((g) => (
          <Enter key={g.title} index={index++} style={{ gap: space.sm }}>
            <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 1.2, color: light.quiet }}>{g.title.toUpperCase()}</Text>
            <View style={{ borderRadius: 22, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
              {g.rows.map((row, i) => {
                const on = isConnected(row);
                return (
                  <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: "rgba(255,255,255,0.14)" }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: light.text, fontSize: 16, fontWeight: "600" }}>{row.label}</Text>
                      <Text style={{ color: light.quiet, fontSize: 13 }}>{row.detail}</Text>
                    </View>
                    {on ? (
                      <Text testID={`onboard-connected-${row.key}`} style={{ color: light.text, fontSize: 13, fontWeight: "600" }}>Connected</Text>
                    ) : (
                      <Press
                        testID={`onboard-connect-${row.key}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Connect ${row.label}`}
                        onPress={() => connect(row)}
                        style={{ paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.92)" }}
                      >
                        <Text style={{ color: "#1A1240", fontSize: 14, fontWeight: "600" }}>{busy === row.key ? "Opening" : row.via === "chats" ? "Import" : "Connect"}</Text>
                      </Press>
                    )}
                  </View>
                );
              })}
            </View>
          </Enter>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 28, paddingBottom: insets.bottom + 20, gap: space.sm }}>
        <Button testID="onboard-continue" label="Continue" variant="light" size="lg" onPress={onDone} />
        <Press testID="onboard-skip" onPress={onDone} accessibilityRole="button" accessibilityLabel="Skip for now" style={{ height: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: light.secondary, fontSize: 15, fontWeight: "600" }}>Skip for now</Text>
        </Press>
      </View>
    </View>
  );
}
