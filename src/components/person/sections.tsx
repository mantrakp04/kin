import { Fragment, type ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { Press } from "../Press";
import { Card, Chip, Hairline, SectionLabel } from "../ui";
import { ago, firstName } from "../../lib/format";
import { color, space, type } from "../../theme/tokens";
import type { PersonDetail } from "./types";

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.md, marginTop: space.xxl }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}

function Rows({ children }: { children: ReactNode[] }) {
  return (
    <Card style={{ paddingVertical: space.xs }}>
      {children.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <Hairline inset={space.lg} />}
          <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>{c}</View>
        </Fragment>
      ))}
    </Card>
  );
}

export function RecentSection({ person, now }: { person: PersonDetail; now: number }) {
  const updates = (person.updates ?? []).filter((u) => u.at <= now).slice(0, 6);
  if (updates.length === 0) return null;
  return (
    <Section label="Recent">
      <Rows>
        {updates.map((u) => (
          <View key={u._id} style={{ gap: 3 }}>
            <Text style={type.bodySmall}>{u.text}</Text>
            <Text style={type.quiet}>
              {u.source} · {ago(u.at, now)}
            </Text>
          </View>
        ))}
      </Rows>
    </Section>
  );
}

export function InterestsSection({ person }: { person: PersonDetail }) {
  const interests = person.interests ?? [];
  if (interests.length === 0) return null;
  return (
    <Section label="Interested in">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {interests.map((i) => (
          <Chip key={i} outlined style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 14.5, color: color.ink }}>{i}</Text>
          </Chip>
        ))}
      </View>
      <Text style={type.quiet}>Based on what {firstName(person.name)} posts publicly.</Text>
    </Section>
  );
}

export function GiftsSection({ person }: { person: PersonDetail }) {
  const gifts = person.sentGifts ?? [];
  if (gifts.length === 0) return null;
  return (
    <Section label="Gifts sent">
      <Rows>
        {gifts.map((g) => (
          <View key={g._id} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
            <Text style={[type.bodySmall, { flex: 1 }]}>{g.name}</Text>
            <Text style={type.quiet}>
              {g.occasion} · {new Date(g.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          </View>
        ))}
      </Rows>
    </Section>
  );
}

function formatBirthday(b: string) {
  const [m, d, y] = b.split("-").map(Number);
  if (!m || !d) return b;
  const date = new Date(Date.UTC(y || 2000, m - 1, d));
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: y ? "numeric" : undefined, timeZone: "UTC" });
}

const handleUrls: Record<string, (h: string) => string> = {
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  x: (h) => `https://x.com/${h}`,
  instagram: (h) => `https://instagram.com/${h}`,
  strava: (h) => `https://www.strava.com/athletes/${h}`,
};
const handleLabels: Record<string, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram", strava: "Strava" };

export function DetailsSection({ person }: { person: PersonDetail }) {
  const rows: Array<{ label: string; value: string; url?: string }> = [];
  if (person.phone) rows.push({ label: "Phone", value: person.phone });
  if (person.email) rows.push({ label: "Email", value: person.email });
  if (person.birthday) rows.push({ label: "Birthday", value: formatBirthday(person.birthday) });
  for (const [k, raw] of Object.entries(person.handles ?? {})) {
    if (!raw) continue;
    const h = raw.replace(/^@/, "");
    rows.push({ label: handleLabels[k] ?? k, value: raw.startsWith("http") ? raw : `@${h}`, url: raw.startsWith("http") ? raw : handleUrls[k]?.(h) });
  }
  if (rows.length === 0) return null;
  return (
    <Section label="Details">
      <Rows>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
            <Text style={[type.quiet, { width: 82 }]}>{r.label}</Text>
            {r.url ? (
              <Press scale={0.98} onPress={() => Linking.openURL(r.url!)} style={{ flex: 1 }}>
                <Text style={[type.bodySmall, { color: color.accent }]} numberOfLines={1}>
                  {r.value}
                </Text>
              </Press>
            ) : (
              <Text style={[type.bodySmall, { flex: 1 }]} numberOfLines={1} selectable>
                {r.value}
              </Text>
            )}
          </View>
        ))}
      </Rows>
    </Section>
  );
}
