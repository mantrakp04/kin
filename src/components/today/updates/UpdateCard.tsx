import { Text, View, type TextStyle } from "react-native";
import type { CardSpec } from "../../../../convex/cardRules";
import { Press } from "../../Press";
import { Avatar } from "../../ui";
import { ago, firstName } from "../../../lib/format";
import { color, font, radius, shadow, space, type } from "../../../theme/tokens";
import type { UpdateItem } from "../types";
import { CardGradient, tint } from "./CardGradient";

const DAY = 24 * 60 * 60 * 1000;
const HALF_HEIGHT = 204;

const serif = (size: number): TextStyle => ({ fontFamily: font.serif, fontSize: size, lineHeight: Math.round(size * 1.12), letterSpacing: -size * 0.018, color: color.ink });
const detailText: TextStyle = { fontSize: 14, lineHeight: 19, color: color.inkSecondary };
const shortDate = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type Props = { u: UpdateItem; card: CardSpec; wide: boolean; now: number; onPerson: (id: string) => void };

export function UpdateCard({ u, card, wide, now, onPerson }: Props) {
  const age = ago(u.at, now);
  return (
    <Press
      testID={`update-card-${u.person.name}`}
      accessibilityRole="button"
      accessibilityLabel={`${u.person.name}. ${u.text} ${u.source}, ${age === "now" ? "just now" : age + " ago"}`}
      scale={0.98}
      onPress={() => onPerson(u.person._id)}
    >
      <View style={{ borderRadius: radius.card, borderCurve: "continuous", boxShadow: shadow.card }}>
        <View
          style={{
            borderRadius: radius.card,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: 1,
            borderColor: color.cardEdge,
            height: wide ? undefined : HALF_HEIGHT,
          }}
        >
          <CardGradient hue={card.hue} />
          <View style={{ flex: wide ? undefined : 1, padding: space.lg, gap: space.lg, justifyContent: "space-between", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.7)" }}>
            <View style={{ gap: space.sm }}>
              <Body card={card} wide={wide} now={now} />
            </View>
            <Footer u={u} wide={wide} age={age} />
          </View>
        </View>
      </View>
    </Press>
  );
}

function Kicker({ children }: { children: string }) {
  if (!children) return null;
  return (
    <Text style={[type.label, { color: color.inkSecondary }]} numberOfLines={1}>
      {children}
    </Text>
  );
}

function Detail({ children, lines = 2 }: { children: string; lines?: number }) {
  if (!children) return null;
  return (
    <Text style={detailText} numberOfLines={lines}>
      {children}
    </Text>
  );
}

function Body({ card, wide, now }: { card: CardSpec; wide: boolean; now: number }) {
  const accent = tint(card.hue);
  const big = (wideSize: number, halfSize: number) => serif(wide ? wideSize : halfSize);

  switch (card.template) {
    case "job":
      return (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View
              style={{
                width: wide ? 44 : 36,
                height: wide ? 44 : 36,
                borderRadius: 12,
                borderCurve: "continuous",
                backgroundColor: "rgba(255,255,255,0.72)",
                borderWidth: 1,
                borderColor: color.cardEdge,
                boxShadow: shadow.xs,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[serif(wide ? 24 : 20), { color: accent }]}>{card.headline.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <Kicker>{card.kicker}</Kicker>
          </View>
          <Text style={[big(36, 26), { marginTop: space.xs }]} numberOfLines={wide ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {card.headline}
          </Text>
          <Detail>{card.detail}</Detail>
        </>
      );

    case "trip": {
      const { start, end } = card.dateRange ?? {};
      return (
        <>
          <Kicker>{card.kicker}</Kicker>
          <Text style={big(52, 34)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {card.headline}
          </Text>
          <Detail>{card.detail}</Detail>
          {start && end && end > start ? <Timeline start={start} end={end} now={now} accent={accent} /> : null}
        </>
      );
    }

    case "move":
      return (
        <>
          <Kicker>{card.kicker}</Kicker>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs }}>
            {card.from ? (
              <Text style={[serif(wide ? 22 : 17), { color: color.inkSecondary }]} numberOfLines={1}>
                {card.from}
              </Text>
            ) : (
              <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: accent }} />
            )}
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", minWidth: 24 }}>
              <View style={{ flex: 1, height: 1.5, backgroundColor: accent, opacity: 0.7 }} />
              <View style={{ width: 8, height: 8, marginLeft: -7, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: accent, transform: [{ rotate: "45deg" }] }} />
            </View>
            <Text style={big(40, 26)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {card.to ?? card.headline}
            </Text>
          </View>
          <Detail>{card.detail}</Detail>
        </>
      );

    case "stat": {
      const value = card.stat?.value ?? card.headline;
      return (
        <>
          <Kicker>{card.kicker}</Kicker>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
            <Text
              style={{ fontSize: wide ? 76 : 54, lineHeight: wide ? 82 : 60, fontWeight: "200", letterSpacing: wide ? -3 : -2, color: color.ink, fontVariant: ["tabular-nums"], flexShrink: 1 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {value}
            </Text>
            {card.stat?.unit ? <Text style={{ fontSize: wide ? 17 : 14, fontWeight: "500", color: accent }}>{card.stat.unit}</Text> : null}
          </View>
          <Detail>{card.detail}</Detail>
        </>
      );
    }

    case "event": {
      const at = card.dateRange?.start;
      return (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            {at ? (
              <View style={{ width: 46, borderRadius: 12, borderCurve: "continuous", overflow: "hidden", backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: color.cardEdge }}>
                <Text style={[type.label, { textAlign: "center", color: color.white, backgroundColor: accent, paddingVertical: 3, letterSpacing: 1 }]}>
                  {new Date(at).toLocaleDateString("en-US", { month: "short" })}
                </Text>
                <Text style={{ textAlign: "center", fontSize: 22, fontWeight: "300", color: color.ink, paddingVertical: 4, fontVariant: ["tabular-nums"] }}>{new Date(at).getDate()}</Text>
              </View>
            ) : null}
            <Kicker>{card.kicker}</Kicker>
          </View>
          <Text style={big(28, 21)} numberOfLines={2}>
            {card.headline}
          </Text>
          <Detail>{card.detail}</Detail>
        </>
      );
    }

    case "quote":
      return (
        <>
          <Kicker>{card.kicker}</Kicker>
          <Text style={[serif(wide ? 54 : 44), { color: accent, height: wide ? 30 : 26, marginTop: space.xs }]}>{"\u201C"}</Text>
          <Text style={big(26, 20)} numberOfLines={3}>
            {card.headline}
          </Text>
          <Detail lines={1}>{card.detail}</Detail>
        </>
      );

    case "place":
      return (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: accent, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accent }} />
            </View>
            <Kicker>{card.kicker}</Kicker>
          </View>
          <Text style={big(34, 24)} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {card.headline}
          </Text>
          <Detail>{card.detail}</Detail>
        </>
      );

    default:
      return (
        <>
          <Kicker>{card.kicker}</Kicker>
          <Text style={big(26, 20)} numberOfLines={3}>
            {card.headline}
          </Text>
          <Detail>{card.detail}</Detail>
        </>
      );
  }
}

function Timeline({ start, end, now, accent }: { start: number; end: number; now: number; accent: string }) {
  const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const left = Math.ceil((end - now) / DAY);
  return (
    <View style={{ gap: 6, marginTop: space.sm }}>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(27,26,34,0.10)" }}>
        <View style={{ width: `${progress * 100}%`, height: 3, borderRadius: 2, backgroundColor: accent }} />
        <View
          style={{
            position: "absolute",
            left: `${progress * 100}%`,
            top: -3.5,
            width: 10,
            height: 10,
            marginLeft: -5,
            borderRadius: 5,
            backgroundColor: color.white,
            borderWidth: 2,
            borderColor: accent,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={type.quiet}>{shortDate(start)}</Text>
        {left > 0 ? <Text style={type.quiet}>{left === 1 ? "Last day" : `${left} days to go`}</Text> : null}
        <Text style={type.quiet}>{shortDate(end)}</Text>
      </View>
    </View>
  );
}

function Footer({ u, wide, age }: { u: UpdateItem; wide: boolean; age: string }) {
  const meta = `${u.source} · ${age}`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Avatar name={u.person.name} hue={u.person.hue} size={wide ? 22 : 20} />
      {wide ? (
        <>
          <Text style={[type.rowName, { fontSize: 13.5, flexShrink: 1 }]} numberOfLines={1}>
            {u.person.name}
          </Text>
          <Text style={[type.quiet, { marginLeft: "auto" }]} numberOfLines={1}>
            {meta}
          </Text>
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={[type.rowName, { fontSize: 13 }]} numberOfLines={1}>
            {firstName(u.person.name)}
          </Text>
          <Text style={[type.quiet, { fontSize: 12 }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      )}
    </View>
  );
}
