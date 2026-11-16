import { useAction, useMutation, useQuery } from "convex/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Fragment, useState } from "react";
import { Switch, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { useToast } from "../Toast";
import { Button, Card, Hairline, SectionLabel } from "../ui";
import { useSession } from "../../lib/session";
import { color, space, type } from "../../theme/tokens";

export function AgentApps() {
  const toast = useToast();
  const { userKey } = useSession();
  const rows = useQuery(api.integrations.connections, { userKey });
  const connectLink = useAction(api.integrations.connectLink);
  const refresh = useAction(api.integrations.refresh);
  const setEnabled = useMutation(api.integrations.setEnabled);
  const [busy, setBusy] = useState<string | null>(null);

  const connect = async (toolkit: string, label: string) => {
    if (busy) return;
    setBusy(toolkit);
    try {
      const redirect = Linking.createURL("agent");
      const res = await connectLink({ userKey, toolkit, redirect });
      if (res.error) return toast(res.error.split("\n")[0].slice(0, 80));
      if (res.url) await WebBrowser.openAuthSessionAsync(res.url, redirect);
      const after = await refresh({ userKey });
      if (after.connected.includes(toolkit)) toast(`${label} connected`);
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : "Could not connect");
    } finally {
      setBusy(null);
    }
  };

  const section = (kind: "calendar" | "context", title: string, note: string) => {
    const list = (rows ?? []).filter((r) => r.kind === kind);
    return (
      <View>
        <SectionLabel>{title}</SectionLabel>
        <Text style={[type.bodySmall, { color: color.inkSecondary, marginTop: space.sm }]}>{note}</Text>
        <View style={{ marginTop: space.xs }}>
          {list.map((r, i) => (
            <Fragment key={r.toolkit}>
              {i > 0 && <Hairline />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.rowName}>{r.label}</Text>
                  <Text style={type.quiet}>{r.connected ? (r.enabled ? "Your agent can use this" : "Connected, off for your agent") : r.status === "INITIATED" ? "Waiting for sign-in" : r.detail}</Text>
                </View>
                {r.connected ? (
                  <Switch
                    testID={`agent-app-${r.toolkit}`}
                    accessibilityLabel={`Let your agent use ${r.label}`}
                    value={r.enabled}
                    onValueChange={(v) => {
                      setEnabled({ userKey, toolkit: r.toolkit, enabled: v }).catch(() => toast("Could not update"));
                    }}
                    trackColor={{ true: color.accent, false: color.hairline }}
                    ios_backgroundColor={color.hairline}
                  />
                ) : (
                  <Button testID={`agent-connect-${r.toolkit}`} label={busy === r.toolkit ? "Opening" : "Connect"} variant="raised" size="sm" disabled={busy !== null} onPress={() => connect(r.toolkit, r.label)} />
                )}
              </View>
            </Fragment>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Card style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs, gap: space.lg }}>
      {section("calendar", "Calendar", "Your agent offers open times and books meetings. Guests never see what's on your calendar. Without one, it uses a demo schedule and sends you requests.")}
      {section("context", "Also let it read", "Off by default. Read-only, for questions like \"what are you working on\". Private repositories and pages are never shared.")}
    </Card>
  );
}
