import { useEffect, useState } from "react";
import { useInstruct } from "../../lib/agent";
import { dayTime, HOME_TZ, weekday } from "../../lib/format";
import { Button, PersonChip } from "../ui";
import { SentenceCard } from "./SentenceCard";
import { lowerFirst, stripPeriod } from "./sentences";
import type { EventItem } from "./types";

export function EventCard({ item, onPerson }: { item: EventItem; onPerson: () => void }) {
  const { update, person } = item;
  const instruct = useInstruct();
  const [going, setGoing] = useState(item.going);
  useEffect(() => setGoing(item.going), [item.going]);

  const text = stripPeriod(update.text);
  const verb = /^\w+ing\b/.test(text) ? `is ${lowerFirst(text)}` : lowerFirst(text);
  const when = dayTime(update.eventAt, HOME_TZ);
  const time = when.slice(when.indexOf(", ") + 2);
  const place = update.place ? ` in ${update.place}` : "";

  const toggle = () => {
    const next = !going;
    setGoing(next);
    instruct({ action: { type: "set_rsvp", payload: { updateId: update._id, going: next } } }).catch(() => setGoing(!next));
  };

  return (
    <SentenceCard
      testID={`event-card-${person.name}`}
      note={when}
      actions={<Button label={going ? "Going" : "Going?"} variant={going ? "ink" : "raised"} size="sm" onPress={toggle} testID="event-going" />}
    >
      <PersonChip name={person.name} hue={person.hue} onPress={onPerson} /> {verb} on {weekday(update.eventAt, HOME_TZ)} at {time}
      {place}.
    </SentenceCard>
  );
}
