import { dayTime, relativeDay, weekday } from "../../lib/format";
import { stripPeriod, subject } from "../today/sentences";
import type { PersonDetail } from "./types";

const DAY = 24 * 60 * 60 * 1000;

function age(p: PersonDetail, now: number) {
  const year = Number(p.birthday?.split("-")[2]);
  if (!year || p.birthdayIn === null) return null;
  return new Date(now + p.birthdayIn * DAY).getUTCFullYear() - year;
}

function lastTalked(at: number | undefined, now: number) {
  if (!at) return "";
  const d = new Date(at);
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return now - at > 300 * DAY ? ` You last talked in ${month} ${d.getFullYear()}.` : ` You last talked in ${month}.`;
}

export function personNote(p: PersonDetail, now: number): string | null {
  const updates = p.updates ?? [];
  const who = subject({ name: p.name, pronoun: p.pronoun ?? null });

  if (p.birthdayIn !== null && p.birthdayIn <= 7) {
    const n = age(p, now);
    const verb = who === "They" ? "turn" : "turns";
    return `Birthday ${relativeDay(p.birthdayIn)}.${n ? ` ${who} ${verb} ${n}.` : ""}`;
  }

  const event = updates.find((u) => u.kind === "event" && u.eventAt && u.eventAt >= now && u.eventAt <= now + 7 * DAY);
  if (event?.eventAt) {
    const when = dayTime(event.eventAt);
    return `${stripPeriod(event.text)} on ${weekday(event.eventAt)} at ${when.slice(when.indexOf(", ") + 2)}.`;
  }

  const change = updates.find((u) => (u.kind === "job" || u.kind === "move" || u.kind === "milestone") && u.at >= now - 7 * DAY && u.at <= now);
  if (change) {
    const head = change.kind === "job" ? "New job this week." : change.kind === "move" ? `Moved to ${p.currentCity} this week.` : `${stripPeriod(change.text)}.`;
    return head + lastTalked(p.lastContactAt, now);
  }

  const trip = updates.find((u) => u.kind === "trip" && u.until && u.until >= now && u.at <= now);
  if (trip?.until) {
    const until = new Date(trip.until).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `In ${p.currentCity} until ${until}.`;
  }

  return null;
}
