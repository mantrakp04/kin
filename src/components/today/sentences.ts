import { firstName } from "../../lib/format";
import type { FeedPerson } from "./types";

export function stripPeriod(s: string) {
  return s.trim().replace(/[.!\s]+$/, "");
}

export function lowerFirst(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export function subject(person: { name: string; pronoun: string | null }) {
  const p = person.pronoun?.split("/")[0]?.trim().toLowerCase();
  if (p === "she" || p === "he" || p === "they") return p[0].toUpperCase() + p.slice(1);
  return firstName(person.name);
}

export function giftReason(reason: string, person: FeedPerson) {
  const r = stripPeriod(reason);
  const first = r.split(" ")[0] ?? "";
  if (/ed$/i.test(first)) return `${subject(person)} ${lowerFirst(r)}`;
  return r;
}

export function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

export function birthdayPhrase(age: number | null, when: string) {
  return age ? ` turns ${age} ${when}.` : `'s birthday is ${when}.`;
}
