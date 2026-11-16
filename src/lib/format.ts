export function ago(at: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - at) / 60000));
  if (m < 60) return m <= 1 ? "now" : `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.round(d / 7)}w`;
}

export const HOME_TZ = "America/New_York";

export function weekday(at: number, timeZone?: string) {
  return new Date(at).toLocaleDateString("en-US", { weekday: "long", timeZone });
}

export function shortWeekday(at: number) {
  return new Date(at).toLocaleDateString("en-US", { weekday: "short" });
}

export function dayTime(at: number, timeZone?: string) {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined, timeZone }).toLowerCase().replace(" ", " ");
  return `${weekday(at, timeZone)}, ${time}`;
}

export function monthDay(at: number) {
  return new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function relativeDay(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function firstName(name: string) {
  return name.split(" ")[0];
}
