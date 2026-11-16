import { View } from "react-native";
import { ruleCard, type CardSpec } from "../../../../convex/cardRules";
import { Enter } from "../../Enter";
import { space } from "../../../theme/tokens";
import type { UpdateItem } from "../types";
import { UpdateCard } from "./UpdateCard";

type Entry = { u: UpdateItem; card: CardSpec };

export function UpdateStream({ updates, now, onPerson, index = 0 }: { updates: UpdateItem[]; now: number; onPerson: (id: string) => void; index?: number }) {
  const entries: Entry[] = updates.map((u) => ({
    u,
    card: u.card ?? ruleCard({ kind: u.kind, text: u.text, at: u.at, until: u.until, place: u.place, personHue: u.person.hue }),
  }));

  const rows: Entry[][] = [];
  for (let k = 0; k < entries.length; k++) {
    const pair = entries[k].card.size === "half" && entries[k + 1]?.card.size === "half";
    rows.push(pair ? [entries[k], entries[++k]] : [entries[k]]);
  }

  return (
    <View style={{ gap: space.md }}>
      {rows.map((row, r) => (
        <View key={row[0].u._id} style={{ flexDirection: "row", gap: space.md }}>
          {row.map(({ u, card }) => (
            <Enter key={u._id} index={index + Math.min(r, 8)} style={{ flex: 1 }}>
              <UpdateCard u={u} card={card} wide={row.length === 1} now={now} onPerson={onPerson} />
            </Enter>
          ))}
        </View>
      ))}
    </View>
  );
}
