import { useAction, useQuery } from "convex/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Fragment, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { useToast } from "../Toast";
import { Button, Card, Hairline, SectionLabel } from "../ui";
import { useSession } from "../../lib/session";
import { color, space, type } from "../../theme/tokens";

type Toolkit = "twitter" | "instagram" | "linkedin";

const ROWS: { toolkit: Toolkit; label: string; detail: string }[] = [
  { toolkit: "twitter", label: "X", detail: "Who you follow and who follows you" },
  { toolkit: "instagram", label: "Instagram", detail: "Business or Creator accounts only" },
  { toolkit: "linkedin", label: "LinkedIn", detail: "Your profile only" },
];

function errorText(toolkit: Toolkit, error: string) {
  if (/managed credentials|use_custom_auth/i.test(error)) return `${toolkit === "twitter" ? "X" : toolkit} needs its own developer app in Composio first`;
  return error.split("\n")[0].slice(0, 80);
}

export function ConnectedAccounts() {
  const toast = useToast();
  const { userKey } = useSession();
  const accounts = useQuery(api.social.accounts, { userKey });
  const connectLink = useAction(api.social.connectLink);
  const refresh = useAction(api.social.refresh);
  const [busy, setBusy] = useState<Toolkit | null>(null);

  const connect = async (toolkit: Toolkit, label: string) => {
    if (busy) return;
    setBusy(toolkit);
    try {
      const redirect = Linking.createURL("you");
      const res = await connectLink({ userKey, toolkit, redirect });
      if (res.error) return toast(errorText(toolkit, res.error));
      if (res.url) await WebBrowser.openAuthSessionAsync(res.url, redirect);
      const after = await refresh({ userKey });
      if (after.connected.includes(toolkit)) toast(`${label} connected`);
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : "Could not connect");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs }}>
      <SectionLabel>Connected accounts</SectionLabel>
      <Text style={[type.bodySmall, { color: color.inkSecondary, marginTop: space.sm }]}>Kin matches people you follow to your contacts. It never posts or sends.</Text>
      <View style={{ marginTop: space.xs }}>
        {ROWS.map((r, i) => {
          const a = accounts?.find((x) => x.toolkit === r.toolkit);
          const detail = a?.connected ? (a.handle ? `Connected as ${r.toolkit === "linkedin" ? a.handle : `@${a.handle}`}` : "Connected") : a?.status === "INITIATED" ? "Waiting for sign-in" : r.detail;
          return (
            <Fragment key={r.toolkit}>
              {i > 0 && <Hairline />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.rowName}>{r.label}</Text>
                  <Text style={type.quiet}>{detail}</Text>
                </View>
                {a?.connected ? (
                  <Text testID={`social-connected-${r.toolkit}`} style={{ fontSize: 13, fontWeight: "600", color: color.success }}>
                    Connected
                  </Text>
                ) : (
                  <Button
                    testID={`social-connect-${r.toolkit}`}
                    label={busy === r.toolkit ? "Opening" : "Connect"}
                    variant="raised"
                    size="sm"
                    disabled={busy !== null}
                    onPress={() => connect(r.toolkit, r.label)}
                  />
                )}
              </View>
            </Fragment>
          );
        })}
      </View>
    </Card>
  );
}
