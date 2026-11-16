import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const DAY = 24 * 60 * 60 * 1000;

export async function userByKey(ctx: QueryCtx, key: string | undefined) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_key", (q) => q.eq("key", key ?? "alex"))
    .unique();
  if (!user) throw new Error("No user. Run the seed first.");
  return user;
}

export function nextBirthday(birthday: string | undefined, now: number, tz = "America/New_York") {
  if (!birthday) return null;
  const [m, d] = birthday.split("-").map(Number);
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  let at = Date.UTC(year, m - 1, d);
  if (at < start) at = Date.UTC(year + 1, m - 1, d);
  return { at, days: Math.round((at - start) / DAY) };
}

export async function currentCityId(ctx: QueryCtx, person: Doc<"people">, now: number): Promise<{ cityId?: Id<"cities">; update?: Doc<"updates"> }> {
  const recent = await ctx.db
    .query("updates")
    .withIndex("by_person_at", (q) => q.eq("personId", person._id))
    .order("desc")
    .take(20);
  const located = recent.find((u) => u.cityId && (u.kind !== "trip" || !u.until || u.until >= now));
  if (located) return { cityId: located.cityId, update: located };
  return { cityId: person.cityId };
}
