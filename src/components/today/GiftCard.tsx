import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Halo } from "../Halo";
import { useToast } from "../Toast";
import { Button, PersonChip } from "../ui";
import { relativeDay, shortWeekday, weekday } from "../../lib/format";
import { radius } from "../../theme/tokens";
import { ProductChip } from "./ProductChip";
import { SentenceCard } from "./SentenceCard";
import { GiftTimeline } from "../gift/GiftTimeline";
import { useSendGift } from "./sendGift";
import { article, birthdayPhrase, giftReason } from "./sentences";
import type { GiftItem } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export function GiftCard({ item, onPerson }: { item: GiftItem; onPerson: () => void }) {
  const { gift, person } = item;
  const toast = useToast();
  const sendGift = useSendGift();
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [halo, setHalo] = useState(true);
  const prevStatus = useRef(gift.status);

  const sent = gift.status === "paid" || gift.status === "ordered";
  const options = [{ product: gift.product, reason: gift.reason, arrives: gift.arrives }, ...gift.alternatives.map((a) => ({ ...a, arrives: Date.now() + a.product.deliveryDays * DAY }))];
  const option = sent ? options[0] : options[pick % options.length];

  useEffect(() => {
    const t = setTimeout(() => setHalo(false), 3200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (gift.status === "ordered" && prevStatus.current !== "ordered") toast(`Gift ordered · arrives ${weekday(gift.arrives)}`);
    prevStatus.current = gift.status;
  }, [gift.status]);

  const onSend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await sendGift(gift._id, option.product._id);
    } catch {
      toast("Could not start checkout");
    } finally {
      setBusy(false);
    }
  };

  const arrives = `arrives ${shortWeekday(option.arrives)}`;
  const note = !sent ? `$${Math.round(option.product.price)} · ${arrives}` : gift.via === "imessage" ? `Sent from Messages · ${arrives}` : `Ordered · ${arrives}`;

  return (
    <View>
      <SentenceCard
        kin
        testID={`gift-card-${person.name}`}
        note={note}
        actions={
          sent ? (
            <Button label="Sent" variant="raised" size="sm" disabled testID="send-gift" />
          ) : (
            <>
              {options.length > 1 && <Button label="Other ideas" variant="raised" size="sm" onPress={() => setPick((p) => p + 1)} testID="other-ideas" />}
              <Button label={busy ? "Opening" : "Send gift"} variant="ink" size="sm" onPress={onSend} disabled={busy} testID="send-gift" />
            </>
          )
        }
      >
        <PersonChip name={person.name} hue={person.hue} onPress={onPerson} />
        {birthdayPhrase(item.age, relativeDay(item.days))} {giftReason(option.reason, person)}, so maybe {article(option.product.name)}{" "}
        <ProductChip name={option.product.name} />.
      </SentenceCard>
      {halo && !sent && <Halo cornerRadius={radius.card} />}
      <GiftTimeline giftId={gift._id} style={{ marginTop: 8 }} />
    </View>
  );
}
