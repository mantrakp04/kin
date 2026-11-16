import { useQuery } from "convex/react";
import { router, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Enter } from "../../components/Enter";
import { Press } from "../../components/Press";
import { Screen } from "../../components/Screen";
import { Avatar, Button, SearchField, SectionLabel } from "../../components/ui";
import { BirthdayCard } from "../../components/today/BirthdayCard";
import { EventCard } from "../../components/today/EventCard";
import { GiftCard } from "../../components/today/GiftCard";
import { UpdateStream } from "../../components/today/updates/UpdateStream";
import { TodayStrip } from "../../components/reminders/TodayStrip";
import { StoriesRow } from "../../components/stories/StoriesRow";
import type { ComingUpItem, TodayFeed } from "../../components/today/types";
import { ago } from "../../lib/format";
import { useSession } from "../../lib/session";
import { color, radius, space, type } from "../../theme/tokens";

const minute = () => Math.floor(Date.now() / 60000) * 60000;

export default function Today() {
  const { userKey } = useSession();
  const [now, setNow] = useState(minute);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 15000);
    const refresh = setInterval(() => setNow(minute()), 5 * 60000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, []);

  const me = useQuery(api.users.me, { userKey });
  const live = useQuery(api.feed.today, { userKey, now });
  const last = useRef<TodayFeed | undefined>(undefined);
  if (live) last.current = live;
  const feed = live ?? last.current;

  const signature = feed ? JSON.stringify([feed.comingUp, feed.updates]) : "";
  const [changedAt, setChangedAt] = useState(Date.now);
  useEffect(() => {
    if (signature) setChangedAt(Date.now());
  }, [signature]);
  const since = ago(changedAt, clock);

  const openPerson = (id: string) => router.push({ pathname: "/person/[id]", params: { id, from: "Today" } });
  const date = new Date(clock).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  let i = 0;
  return (
    <Screen>
      <Enter index={i++}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ gap: space.xs }}>
            <SectionLabel>{date}</SectionLabel>
            <Text style={type.title}>Today</Text>
            <Text style={type.quiet}>{!feed ? "Updating" : since === "now" ? "Updated just now" : `Updated ${since} ago`}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Press
              testID="share-my-agent"
              accessibilityRole="button"
              accessibilityLabel="Share my agent"
              scale={0.96}
              haptic
              onPress={() => router.push("/agent")}
              style={{ height: 34, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.capsule, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: color.hairline }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: color.ink, letterSpacing: -0.1 }}>Share</Text>
            </Press>
            <Press
              testID="ask-kin"
              accessibilityRole="button"
              accessibilityLabel="Ask Kin"
              scale={0.96}
              haptic
              onPress={() => router.push("/chat")}
              style={{ height: 34, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.capsule, borderCurve: "continuous", backgroundColor: color.aiSubtle, borderWidth: 1, borderColor: "rgba(139,92,246,0.22)" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: color.ai, letterSpacing: -0.1 }}>Ask Kin</Text>
            </Press>
            {me && (
              <Press testID="open-you" accessibilityRole="button" accessibilityLabel="You" scale={0.94} haptic onPress={() => router.push("/you")}>
                <Avatar name={me.name} hue={me.hue} size={38} />
              </Press>
            )}
          </View>
        </View>
      </Enter>
      <Enter index={i++} style={{ marginTop: space.lg }}>
        <SearchField placeholder={me ? `Search ${me.contactCount} people` : "Search people"} />
      </Enter>
      <StoriesRow index={i++} />

      {feed && (
        <>
          <TodayStrip index={i++} now={clock} />
          <Enter index={i++} style={{ marginTop: space.xxl, marginBottom: space.md }}>
            <SectionLabel>Coming up</SectionLabel>
          </Enter>
          {feed.comingUp.length === 0 ? (
            <Enter index={i++}>
              <Text style={type.quiet}>Nothing in the next week.</Text>
            </Enter>
          ) : (
            feed.comingUp.map((item) => (
              <Enter key={item.key} index={i++} style={{ marginBottom: space.md }}>
                <ComingUp item={item} onPerson={() => openPerson(item.person._id)} />
              </Enter>
            ))
          )}

          {feed.updates.length > 0 && (
            <>
              <Enter index={i++} style={{ marginTop: space.lg, marginBottom: space.md }}>
                <SectionLabel>Updates</SectionLabel>
              </Enter>
              <UpdateStream updates={feed.updates} now={clock} onPerson={openPerson} index={i++} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function ComingUp({ item, onPerson }: { item: ComingUpItem; onPerson: () => void }) {
  if (item.type === "gift") return <GiftCard item={item} onPerson={onPerson} />;
  if (item.type === "event") return <EventCard item={item} onPerson={onPerson} />;
  return <BirthdayCard item={item} onPerson={onPerson} />;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <Text style={type.title}>Today</Text>
      <Text style={[type.body, { marginTop: space.md, marginBottom: space.lg }]}>Today could not load. Check that the server is running and seeded.</Text>
      <Button label="Try again" variant="raised" onPress={retry} style={{ alignSelf: "flex-start" }} />
    </Screen>
  );
}
