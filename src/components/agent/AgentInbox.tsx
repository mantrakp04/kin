import { useMutation, useQuery } from "convex/react";
import { Fragment, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Press } from "../Press";
import { Button, Card, Hairline, SectionLabel } from "../ui";
import { ago } from "../../lib/format";
import { useSession } from "../../lib/session";
import { color, space, type } from "../../theme/tokens";

function Thread({ threadId }: { threadId: Id<"guestThreads"> }) {
  const { userKey } = useSession();
  const rows = useQuery(api.publicAgent.guestThread, { userKey, threadId });
  if (!rows) return <Text style={type.quiet}>Loading</Text>;
  return (
    <View style={{ gap: space.sm, paddingBottom: space.md }}>
      {rows.map((m) => (
        <View key={m._id} style={{ gap: 2 }}>
          <Text style={[type.label, m.role === "agent" ? { color: color.ai } : null]}>{m.role === "agent" ? "Your agent" : "Guest"}</Text>
          <Text style={{ fontSize: 14.5, lineHeight: 20, color: color.ink }}>{m.text}</Text>
        </View>
      ))}
    </View>
  );
}

const since = (at: number, now: number) => {
  const a = ago(at, now);
  return a === "now" ? "just now" : `${a} ago`;
};

const KIND: Record<string, string> = { meeting: "Wants to meet", booked: "Booked", message: "Message" };

export function AgentInbox() {
  const { userKey } = useSession();
  const data = useQuery(api.publicAgent.inbox, { userKey });
  const mark = useMutation(api.publicAgent.markInbox);
  const [open, setOpen] = useState<string | null>(null);
  const now = Date.now();
  const requests = (data?.requests ?? []).filter((r) => r.status !== "done");
  const threads = data?.threads ?? [];

  return (
    <View testID="agent-inbox">
      <Card style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs, gap: space.xs }}>
        <SectionLabel>Inbox</SectionLabel>
        {requests.length === 0 && threads.length === 0 ? (
          <Text style={[type.bodySmall, { color: color.inkSecondary, paddingVertical: space.md }]}>When someone talks to your agent, you'll see a one-line summary here.</Text>
        ) : null}
        {requests.map((r, i) => (
          <Fragment key={r._id}>
            {i > 0 && <Hairline />}
            <View style={{ flexDirection: "row", gap: space.md, alignItems: "center", paddingVertical: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.quiet, { color: r.kind === "booked" ? color.success : color.ai, fontWeight: "600" }]}>{KIND[r.kind] ?? "Request"}</Text>
                <Text style={type.bodySmall}>{r.text}</Text>
                <Text style={type.quiet}>{since(r.at, now)}</Text>
              </View>
              <Button testID={`agent-inbox-done-${i}`} label="Done" variant="quiet" size="sm" onPress={() => mark({ userKey, id: r._id, status: "done" })} />
            </View>
          </Fragment>
        ))}
        {threads.map((t, i) => (
          <Fragment key={t._id}>
            {(i > 0 || requests.length > 0) && <Hairline />}
            <Press testID={`agent-thread-${i}`} accessibilityRole="button" accessibilityLabel="Open conversation" onPress={() => setOpen(open === t._id ? null : t._id)} style={{ paddingVertical: space.md, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                <Text style={type.rowName}>{t.guestName ?? (t.kind === "agent" ? "Another agent" : "A guest")}</Text>
                <Text style={type.quiet}>{since(t.lastAt, now)}</Text>
              </View>
              <Text style={[type.bodySmall, { color: color.inkSecondary }]}>{t.summary ?? `${t.messageCount} messages`}</Text>
              <Text style={type.quiet}>{[t.label, open === t._id ? "Hide conversation" : "Open conversation"].filter(Boolean).join(" · ")}</Text>
            </Press>
            {open === t._id ? <Thread threadId={t._id} /> : null}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}
