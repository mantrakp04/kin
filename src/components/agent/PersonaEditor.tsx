import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { useToast } from "../Toast";
import { Button, Card, Hairline, SectionLabel } from "../ui";
import { ToggleRow } from "../you/ToggleRow";
import { useSession } from "../../lib/session";
import { color, space, type } from "../../theme/tokens";
import { Field } from "./Field";

type Draft = { headline: string; bio: string; workingOn: string; voice: string; mayShare: string; reach: string; interests: string };

export function PersonaEditor() {
  const toast = useToast();
  const { userKey } = useSession();
  const data = useQuery(api.persona.get, { userKey });
  const update = useMutation(api.persona.update);
  const build = useAction(api.persona.build);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [building, setBuilding] = useState(false);
  const p = data?.persona;
  const sig = p ? JSON.stringify(p) : "";

  useEffect(() => {
    if (p) setDraft({ headline: p.headline, bio: p.bio, workingOn: p.workingOn, voice: p.voice, mayShare: p.mayShare, reach: p.reach, interests: p.interests.join(", ") });
  }, [sig]);

  if (!p || !draft) return null;
  const set = (k: keyof Draft) => (v: string) => setDraft({ ...draft, [k]: v });
  const dirty = draft.headline !== p.headline || draft.bio !== p.bio || draft.workingOn !== p.workingOn || draft.voice !== p.voice || draft.mayShare !== p.mayShare || draft.reach !== p.reach || draft.interests !== p.interests.join(", ");

  const save = async () => {
    try {
      await update({ userKey, ...draft, interests: draft.interests.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8) });
      toast("Saved");
    } catch {
      toast("Could not save");
    }
  };

  const rebuild = async () => {
    if (building) return;
    setBuilding(true);
    try {
      const r = await build({ userKey });
      toast(r.ok ? `Rebuilt from your ${r.styleSource}` : "Could not rebuild right now");
    } catch {
      toast("Could not rebuild right now");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <Card style={{ padding: space.lg, gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <SectionLabel>How it talks about you</SectionLabel>
        <Text style={[type.bodySmall, { color: color.inkSecondary }]}>
          {p.builtAt ? `Built from your ${p.styleSource ?? "profile"}. Your messages shape the voice only; none are stored or quoted.` : "Kin can learn your voice from messages you sent. It keeps a short style guide, never the messages."}
        </Text>
      </View>
      <Field testID="persona-headline" label="Headline" value={draft.headline} onChangeText={set("headline")} />
      <Field testID="persona-bio" label="Bio" value={draft.bio} onChangeText={set("bio")} multiline />
      <Field testID="persona-working-on" label="Working on" value={draft.workingOn} onChangeText={set("workingOn")} multiline />
      <Field testID="persona-interests" label="Interests" value={draft.interests} onChangeText={set("interests")} hint="Separated by commas" />
      <Field testID="persona-voice" label="Voice" value={draft.voice} onChangeText={set("voice")} multiline hint="Tone, length, emoji, phrases" />
      <Field testID="persona-may-share" label="What it may share" value={draft.mayShare} onChangeText={set("mayShare")} multiline />
      <Field testID="persona-reach" label="Reach me professionally" value={draft.reach} onChangeText={set("reach")} hint="Public handles only. Never a phone number or email." />
      <View>
        <Hairline />
        <ToggleRow testID="persona-share-city" label="Share my city" detail={`Only "${data.city}", never a location`} value={p.shareCity} onChange={(v) => update({ userKey, shareCity: v }).catch(() => toast("Could not save"))} />
      </View>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button testID="persona-save" label="Save" variant="ink" size="sm" disabled={!dirty} onPress={save} />
        <Button testID="persona-rebuild" label={building ? "Learning your voice" : "Rebuild from my messages"} variant="raised" size="sm" disabled={building} onPress={rebuild} />
      </View>
    </Card>
  );
}
