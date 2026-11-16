const DAY = 24 * 60 * 60 * 1000;

export function dayStart(at: number) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function atHour(dayOffset: number, hour: number, from = Date.now()) {
  const d = new Date(dayStart(from));
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour);
  return d.getTime();
}

export function daysFrom(at: number, now = Date.now()) {
  return Math.round((dayStart(at) - dayStart(now)) / DAY);
}

export function hourLabel(at: number) {
  const d = new Date(at);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

export function dayLabel(dayOffset: number, from = Date.now(), short = false) {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  if (dayOffset === -1) return "Yesterday";
  const at = atHour(dayOffset, 12, from);
  if (dayOffset > 1 && dayOffset < 7) return new Date(at).toLocaleDateString("en-US", { weekday: short ? "short" : "long" });
  return new Date(at).toLocaleDateString("en-US", short ? { weekday: "short", day: "numeric" } : { month: "long", day: "numeric" });
}

export function whenLabel(at: number, now = Date.now()) {
  return `${dayLabel(daysFrom(at, now), now)}, ${hourLabel(at)}`;
}

export function section(at: number, now = Date.now()) {
  const days = daysFrom(at, now);
  if (days <= 0) return "Today";
  if (days < 7) return "This week";
  return "Later";
}

export function snoozeUntil(fireAt: number, now = Date.now()) {
  return Math.max(fireAt, now) + DAY;
}

export function quickPicks(now = Date.now()) {
  const toMonday = ((8 - new Date(now).getDay()) % 7) || 7;
  return [
    { label: "Tonight 8 pm", day: 0, hour: 20 },
    { label: "Tomorrow 9 am", day: 1, hour: 9 },
    { label: "Next week", day: toMonday, hour: 9 },
  ].filter((p) => atHour(p.day, p.hour, now) > now);
}

export const HOURS = [8, 9, 12, 15, 18, 20];
export const DAYS = [0, 1, 2, 3, 4, 5, 6, 7];
