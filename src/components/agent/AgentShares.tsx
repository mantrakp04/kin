import { useMutation, useQuery } from "convex/react";
import { Fragment, useState } from "react";
import { Share, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useToast } from "../Toast";
import { Button, Card, Hairline, SectionLabel } from "../ui";
import { monthDay } from "../../lib/format";
import { useSession } from "../../lib/session";
import { color, space, type } from "../../theme/tokens";
import { Field } from "./Field";

export function AgentShares() {
  const toast = useToast();
  const { userKey } = useSession();
  const shares = useQuery(api.publicAgent.shares, { userKey });
  const create = useMutation(api.publicAgent.createShare);
  const revoke = useMutation(api.publicAgent.revokeShare);
  const [label, setLabel] = useState("");

  const add = async () => {
    try {
      const s = await create({ userKey, label: label.trim() || "Shared link", canBook: true, expiresInDays: 30 });
      setLabel("");
      if (s.url) await Share.share({ message: `Ask my Kin agent: ${s.url}`, url: s.url });
    } catch {
      toast("Could not create link");
    }
  };

  const cut = async (id: Id<"agentShares">) => {
    try {
      await revoke({ userKey, shareId: id });
      toast("Link turned off");
    } catch {
      toast("Could not turn off");
    }
  };

  const live = (shares ?? []).filter((s) => !s.revoked && (!s.expiresAt || s.expiresAt > Date.now()));
  return (
    <Card style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.sm }}>
      <SectionLabel>Active links</SectionLabel>
      <Text style={[type.bodySmall, { color: color.inkSecondary }]}>Turning a link off works instantly, mid-conversation too.</Text>
      <View>
        {live.map((s, i) => (
          <Fragment key={s._id}>
            {i > 0 && <Hairline />}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.rowName} numberOfLines={1}>{s.label}</Text>
                <Text style={type.quiet}>{[s.expiresAt ? `Until ${monthDay(s.expiresAt)}` : "No end date", s.lastUsedAt ? "used" : "not used yet"].join(" · ")}</Text>
              </View>
              <Button testID={`agent-revoke-${i}`} label="Turn off" variant="quiet" size="sm" onPress={() => cut(s._id)} />
            </View>
          </Fragment>
        ))}
      </View>
      <Hairline />
      <View style={{ gap: space.sm, paddingTop: space.sm }}>
        <Field testID="agent-new-link-label" label="New link for one person or event" placeholder="Met at YC hackathon" value={label} onChangeText={setLabel} hint="Ends after 30 days" />
        <Button testID="agent-new-link" label="Create and share" variant="raised" size="sm" style={{ alignSelf: "flex-start" }} onPress={add} />
      </View>
    </Card>
  );
}
