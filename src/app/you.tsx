import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Enter } from "../components/Enter";
import { Press } from "../components/Press";
import { Screen } from "../components/Screen";
import { useToast } from "../components/Toast";
import { Avatar, Button, Card, Hairline, IconButton, SectionLabel } from "../components/ui";
import { ConnectedAccounts } from "../components/social/ConnectedAccounts";
import { ChatsCard } from "../components/chats/ChatsCard";
import { Segmented } from "../components/you/Segmented";
import { ToggleRow } from "../components/you/ToggleRow";
import { useSession } from "../lib/session";
import { color, space, type } from "../theme/tokens";

const KEIKI_NUMBER = process.env.EXPO_PUBLIC_KIN_NUMBER ?? "+15555550199";

type Visibility = { city: boolean; birthday: boolean; jobChanges: boolean; trips: boolean };

const TOGGLES: { key: keyof Visibility; label: string; detail: string }[] = [
  { key: "city", label: "City", detail: "Only the city, never a location" },
  { key: "birthday", label: "Birthday", detail: "Month and day" },
  { key: "jobChanges", label: "Job changes", detail: "From your public LinkedIn" },
  { key: "trips", label: "Trips", detail: "Cities you are visiting" },
];

function errorText(e: unknown) {
  return e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : "Something went wrong";
}

export default function YouPage() {
  const toast = useToast();
  const { userKey, setUserKey } = useSession();
  const me = useQuery(api.users.me, { userKey });
  const users = useQuery(api.users.list) ?? [];
  const setVisibility = useMutation(api.users.setVisibility).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.users.me, { userKey: args.userKey });
    if (current) store.setQuery(api.users.me, { userKey: args.userKey }, { ...current, visibility: args.visibility });
  });
  const birthdayCheckAction = useAction(anyApi.demo.birthdayCheck);
  const birthdayCheckMutation = useMutation(anyApi.demo.birthdayCheck);
  const sendBirthdayNotice = useAction(anyApi.keiki.sendBirthdayNotice);
  const [checking, setChecking] = useState(false);

  const toggle = (key: keyof Visibility, value: boolean) => {
    if (!me) return;
    setVisibility({ userKey, visibility: { ...me.visibility, [key]: value } }).catch((e) => toast(errorText(e)));
  };

  const textKin = () => {
    Linking.openURL(`sms:${KEIKI_NUMBER}&body=Hi%20Kin`).catch(() => toast("Messages is not available here"));
  };

  const runBirthdayCheck = async () => {
    if (checking) return;
    setChecking(true);
    const attempts = [() => birthdayCheckAction({ userKey }), () => birthdayCheckMutation({ userKey }), () => sendBirthdayNotice({ userKey })];
    let last: unknown;
    for (const attempt of attempts) {
      try {
        const result = await attempt();
        toast(typeof result === "string" ? result : "Birthday check sent");
        setChecking(false);
        return;
      } catch (e) {
        last = e;
      }
    }
    setChecking(false);
    toast(errorText(last));
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  return (
    <Screen dock={false}>
      <IconButton label="Back" onPress={back}>
        <Text testID="you-back" style={{ fontSize: 22, lineHeight: 24, color: color.ink, marginTop: -2 }}>‹</Text>
      </IconButton>

      <Enter index={0} style={{ alignItems: "flex-start", marginTop: space.xl, gap: space.md }}>
        {me ? <Avatar name={me.name} hue={me.hue} size={68} /> : <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: color.hairline }} />}
        <View style={{ gap: 4 }}>
          <Text style={type.name}>{me?.name ?? " "}</Text>
          <Text style={[type.body, { color: color.inkSecondary }]}>{me ? `${me.role} · ${me.city}` : " "}</Text>
        </View>
      </Enter>

      <Enter index={1} style={{ marginTop: space.xxl }}>
        <Press testID="open-agent" accessibilityRole="link" accessibilityLabel="Your agent" haptic onPress={() => router.push("/agent")}>
          <Card style={{ padding: space.lg, flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ flex: 1, gap: space.xs }}>
              <SectionLabel>Your agent</SectionLabel>
              <Text style={type.bodySmall}>Share it like a contact. It talks like you and books time.</Text>
            </View>
            <Text style={{ fontSize: 22, color: color.inkQuiet }}>›</Text>
          </Card>
        </Press>
      </Enter>

      <Enter index={2} style={{ marginTop: space.lg }}>
        <Card style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs }}>
          <SectionLabel>What your contacts see</SectionLabel>
          <View style={{ marginTop: space.xs }}>
            {TOGGLES.map((t, i) => (
              <View key={t.key}>
                {i > 0 && <Hairline />}
                <ToggleRow testID={`visibility-${t.key}`} label={t.label} detail={t.detail} value={me?.visibility[t.key] ?? false} onChange={(v) => toggle(t.key, v)} />
              </View>
            ))}
          </View>
        </Card>
      </Enter>

      <Enter index={2} style={{ marginTop: space.lg }}>
        <Card style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Kin in Messages</SectionLabel>
            {me?.keikiOptIn && <Text testID="keiki-connected" style={{ fontSize: 13, fontWeight: "600", color: color.success }}>Connected</Text>}
          </View>
          <Text style={type.bodySmall}>Text Kin and it will tell you when something matters.</Text>
          <Button testID="text-kin" label="Text Kin" variant="ink" onPress={textKin} style={{ alignSelf: "flex-start" }} />
        </Card>
      </Enter>

      <Enter index={2} style={{ marginTop: space.lg }}>
        <ConnectedAccounts />
      </Enter>

      <Enter index={3} style={{ marginTop: space.lg }}>
        <ChatsCard />
      </Enter>

      <Enter index={3} style={{ marginTop: space.lg }}>
        <Press testID="open-reminders" accessibilityRole="link" accessibilityLabel="Reminders" haptic onPress={() => router.push("/reminders")}>
          <Card style={{ padding: space.lg, flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ flex: 1, gap: space.xs }}>
              <SectionLabel>Reminders</SectionLabel>
              <Text style={type.bodySmall}>Birthdays, plans, and friends in town.</Text>
            </View>
            <Text style={{ fontSize: 22, color: color.inkQuiet }}>›</Text>
          </Card>
        </Press>
      </Enter>

      <Enter index={4} style={{ marginTop: space.xxl, gap: space.md, paddingHorizontal: space.xs }}>
        <SectionLabel>Demo</SectionLabel>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={type.quiet}>Signed in as</Text>
          <Segmented
            options={(users.length ? users : [{ key: "alex", name: "Alex Rivera" }, { key: "maya", name: "Maya Chen" }]).map((u) => ({ key: u.key, label: u.name.split(" ")[0] }))}
            value={userKey}
            onChange={setUserKey}
          />
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button testID="replay-intro" label="Replay intro" variant="quiet" size="sm" onPress={() => router.push("/onboarding")} />
          <Button testID="run-birthday-check" label={checking ? "Checking" : "Run birthday check"} variant="quiet" size="sm" disabled={checking} onPress={runBirthdayCheck} />
        </View>
      </Enter>
    </Screen>
  );
}
