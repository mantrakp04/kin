import { router } from "expo-router";
import { useToast } from "../Toast";
import { useInstruct } from "../../lib/agent";
import { Button, PersonChip } from "../ui";
import { relativeDay } from "../../lib/format";
import { SentenceCard } from "./SentenceCard";
import { birthdayPhrase } from "./sentences";
import type { BirthdayItem } from "./types";

export function BirthdayCard({ item, onPerson }: { item: BirthdayItem; onPerson: () => void }) {
  const toast = useToast();
  const instruct = useInstruct();
  const draft = () => {
    instruct({ action: { type: "draft_message", payload: { personId: item.person._id, reason: "birthday" } } }).catch(() => toast("Could not start a draft"));
    router.push("/chat");
  };
  return (
    <SentenceCard
      testID={`birthday-card-${item.person.name}`}
      note="Birthday"
      actions={<Button label="Draft a message" variant="quiet" size="sm" onPress={draft} testID={`birthday-draft-${item.person.name}`} />}
    >
      <PersonChip name={item.person.name} hue={item.person.hue} onPress={onPerson} />
      {birthdayPhrase(item.age, relativeDay(item.days))}
    </SentenceCard>
  );
}
