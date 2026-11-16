import { useQuery } from "convex/react";
import { router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Enter } from "../../components/Enter";
import { Press } from "../../components/Press";
import { Screen } from "../../components/Screen";
import { useToast } from "../../components/Toast";
import { Avatar, Button, Card, IconButton } from "../../components/ui";
import { Icon, MoreDots } from "../../components/person/Icon";
import { personNote } from "../../components/person/note";
import { DetailsSection, GiftsSection, InterestsSection, RecentSection } from "../../components/person/sections";
import { NewReminderSheet } from "../../components/reminders/NewReminderSheet";
import { useInstruct } from "../../lib/agent";
import { YouBothKnow } from "../../components/social/YouBothKnow";
import { RelationshipStrip } from "../../components/chats/RelationshipStrip";
import { backdrops, color, personBackdrop, space, type } from "../../theme/tokens";

function Header({ from }: { from?: string }) {
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xl }}>
      <Press testID="person-back" accessibilityRole="button" accessibilityLabel={from ?? "Back"} haptic onPress={back} style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 34, paddingRight: space.sm }}>
        <Icon name="back" size={20} />
        <Text style={{ fontSize: 16, fontWeight: "500", color: color.ink }}>{from ?? "Back"}</Text>
      </Press>
      <Button label="Edit" variant="raised" size="sm" testID="person-edit" />
    </View>
  );
}

export default function PersonPage() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const [now] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const person = useQuery(api.people.get, { personId: id as Id<"people">, now });
  const toast = useToast();
  const instruct = useInstruct();
  const [remind, setRemind] = useState(false);

  if (person === undefined) {
    return (
      <Screen dock={false}>
        <Header from={from} />
      </Screen>
    );
  }
  if (person === null) {
    return (
      <Screen dock={false}>
        <Header from={from} />
        <Text style={type.body}>This person is no longer in your contacts.</Text>
      </Screen>
    );
  }

  const visiting = person.currentCity && person.currentCity !== person.city;
  const place = visiting ? `Visiting ${person.currentCity}` : person.city;
  const subtitle = [person.role, place].filter(Boolean).join(" · ");
  const note = personNote(person, now);
  const phone = person.phone?.replace(/[^+\d]/g, "");
  const draft = () => {
    instruct({ action: { type: "draft_message", payload: { personId: person._id, reason: "catching up" } } }).catch(() => toast("Could not start a draft"));
    router.push("/chat");
  };

  return (
    <Screen colors={person.hue != null ? personBackdrop(person.hue) : backdrops.app} dock={false}>
      <Header from={from} />
      <Enter index={0} style={{ gap: space.md }}>
        <Avatar name={person.name} hue={person.hue} size={68} />
        <View style={{ gap: 2 }}>
          <Text style={type.name} testID="person-name">
            {person.name}
          </Text>
          {subtitle ? <Text style={[type.bodySmall, { color: color.inkSecondary }]}>{subtitle}</Text> : null}
        </View>
      </Enter>
      <Enter index={1} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xl }}>
        <Button label="Message" variant="ink" size="lg" style={{ flex: 1 }} testID="person-message" onPress={draft} onLongPress={phone ? () => Linking.openURL(`sms:${phone}`) : undefined} />
        <IconButton label="Call" size={52} onPress={phone ? () => Linking.openURL(`tel:${phone}`) : undefined}>
          <Icon name="phone" size={19} />
        </IconButton>
        <IconButton label="More" size={52} onPress={() => toast("More options are coming soon")}>
          <MoreDots />
        </IconButton>
      </Enter>
      <Enter index={1} style={{ marginTop: space.md, alignSelf: "flex-start" }}>
        <Button label="Remind me" variant="quiet" size="sm" testID="remind-me" onPress={() => setRemind(true)} />
      </Enter>
      <Enter index={2}>
        <RelationshipStrip personId={person._id} now={now} />
      </Enter>
      {note && (
        <Enter index={2} style={{ marginTop: space.xl }}>
          <Card style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
            <Text style={type.body} testID="person-note">
              {note}
            </Text>
          </Card>
        </Enter>
      )}
      <Enter index={3}>
        <RecentSection person={person} now={now} />
        <InterestsSection person={person} />
        <YouBothKnow personId={person._id} personName={person.name} />
        <GiftsSection person={person} />
        <DetailsSection person={person} />
      </Enter>
      <NewReminderSheet visible={remind} onClose={() => setRemind(false)} person={{ _id: person._id, name: person.name, hue: person.hue }} />
    </Screen>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen dock={false}>
      <Header from="Back" />
      <Text style={[type.body, { marginBottom: space.lg }]}>This page could not load.</Text>
      <Button label="Try again" variant="raised" onPress={retry} style={{ alignSelf: "flex-start" }} />
    </Screen>
  );
}
