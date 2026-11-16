import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useSession } from "../../lib/session";
import { color, radius, shadow, space, type } from "../../theme/tokens";
import { Press } from "../Press";
import { useToast } from "../Toast";
import { Avatar, Button, SectionLabel } from "../ui";
import { DAYS, HOURS, atHour, dayLabel, hourLabel, quickPicks, whenLabel } from "./when";

type Person = { _id: string; name: string; hue: number };

function Choice({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Press
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      haptic
      scale={0.96}
      onPress={onPress}
      style={[
        { height: 32, paddingHorizontal: 12, borderRadius: radius.chip, borderCurve: "continuous", justifyContent: "center" },
        selected ? { backgroundColor: color.ink } : { backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge, boxShadow: shadow.xs },
      ]}
    >
      <Text style={{ fontSize: 14, fontWeight: "600", color: selected ? color.white : color.ink }}>{label}</Text>
    </Press>
  );
}

function PersonPicker({ person, onChange }: { person: Person | null; onChange: (p: Person | null) => void }) {
  const { userKey } = useSession();
  const [query, setQuery] = useState("");
  const groups = useQuery(api.people.list, person ? "skip" : { userKey });
  if (person) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Avatar name={person.name} hue={person.hue} size={26} />
        <Text style={[type.rowName, { flex: 1 }]}>{person.name}</Text>
        <Button label="Remove" variant="quiet" size="sm" onPress={() => onChange(null)} />
      </View>
    );
  }
  const needle = query.trim().toLowerCase();
  const matches = needle ? (groups ?? []).flatMap((g) => g.people).filter((p) => p.name.toLowerCase().split(" ").some((part) => part.startsWith(needle))).slice(0, 4) : [];
  return (
    <View style={{ gap: space.sm }}>
      <TextInput testID="reminder-person" value={query} onChangeText={setQuery} placeholder="Person (optional)" placeholderTextColor={color.inkQuiet} style={fieldStyle} />
      {matches.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {matches.map((p) => (
            <Press key={p._id} accessibilityRole="button" accessibilityLabel={p.name} scale={0.96} onPress={() => onChange(p)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 10, borderRadius: radius.chip, borderCurve: "continuous", backgroundColor: color.cardSolid, borderWidth: 1, borderColor: color.cardEdge }}>
              <Avatar name={p.name} hue={p.hue} size={18} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: color.ink }}>{p.name}</Text>
            </Press>
          ))}
        </View>
      )}
    </View>
  );
}

const fieldStyle = {
  minHeight: 44,
  paddingHorizontal: 14,
  paddingVertical: 11,
  borderRadius: radius.field,
  borderCurve: "continuous" as const,
  backgroundColor: "rgba(255,255,255,0.7)",
  borderWidth: 1,
  borderColor: color.cardEdge,
  boxShadow: "inset 0 1px 2px 0 rgba(27,26,34,0.05)",
  fontSize: 16,
  color: color.ink,
};

export function NewReminderSheet({ visible, onClose, person: initialPerson }: { visible: boolean; onClose: () => void; person?: Person }) {
  const { userKey } = useSession();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const create = useMutation(api.reminders.create);
  const [person, setPerson] = useState<Person | null>(initialPerson ?? null);
  const [text, setText] = useState("");
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState(9);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!visible) return;
    setPerson(initialPerson ?? null);
    setText(initialPerson ? `Check in with ${initialPerson.name.split(" ")[0]}` : "");
    setDay(1);
    setHour(9);
    setNow(Date.now());
  }, [visible, initialPerson?._id]);

  const fireAt = atHour(day, hour, now);
  const valid = text.trim().length > 0 && fireAt > Date.now();

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await create({ userKey, personId: person ? (person._id as Id<"people">) : undefined, title: text.trim(), fireAt });
      toast(`Reminder set for ${whenLabel(fireAt)}`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : "Could not save the reminder");
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(27,26,34,0.18)" }} />
        <View
          testID="reminder-sheet"
          style={{ backgroundColor: color.cardSolid, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderCurve: "continuous", boxShadow: shadow.dock, paddingTop: space.sm, paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.lg, gap: space.lg }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: color.edge }} />
          <Text style={[type.name, { fontSize: 30 }]}>New reminder</Text>
          <PersonPicker person={person} onChange={setPerson} />
          <TextInput testID="reminder-text" value={text} onChangeText={setText} placeholder="What should Kin remind you about?" placeholderTextColor={color.inkQuiet} multiline style={fieldStyle} />
          <View style={{ gap: space.sm }}>
            <SectionLabel>When</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {quickPicks(now).map((p) => (
                <Choice
                  key={p.label}
                  testID={`reminder-pick-${p.label}`}
                  label={p.label}
                  selected={day === p.day && hour === p.hour}
                  onPress={() => {
                    setDay(p.day);
                    setHour(p.hour);
                  }}
                />
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {DAYS.map((d) => (
                <Choice key={d} label={dayLabel(d, now, true)} selected={day === d} onPress={() => setDay(d)} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {HOURS.map((h) => (
                <Choice key={h} label={hourLabel(atHour(0, h, now))} selected={hour === h} onPress={() => setHour(h)} />
              ))}
            </ScrollView>
            <Text style={type.quiet}>{fireAt > Date.now() ? whenLabel(fireAt, now) : "That time has passed. Pick a later one."}</Text>
          </View>
          <Button testID="reminder-save" label={saving ? "Saving" : "Save reminder"} variant="ink" size="lg" disabled={!valid || saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
