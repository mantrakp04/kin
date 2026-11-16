import { internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const PUSH_URL = "https://exp.host/--/api/v2/push/send";

type Due = {
  id: Id<"reminders">;
  personId: Id<"people"> | null;
  title: string;
  body: string;
  channel: "push" | "imessage" | "both";
  userKey: string;
  keikiOptIn: boolean;
  tokens: string[];
  giftId: Id<"gifts"> | null;
};

type Ticket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

export const claimDue = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Due[]> => {
    const due = [];
    for (const status of ["scheduled", "snoozed"] as const) {
      due.push(...(await ctx.db.query("reminders").withIndex("by_status_fireAt", (q) => q.eq("status", status).lte("fireAt", now)).take(100)));
    }
    const out: Due[] = [];
    for (const r of due) {
      await ctx.db.patch(r._id, { status: "sent" });
      const user = await ctx.db.get(r.ownerId);
      if (!user) continue;
      const tokens = await ctx.db.query("pushTokens").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
      let giftId: Id<"gifts"> | null = null;
      if (r.kind === "birthday" && r.personId) {
        const gifts = await ctx.db.query("gifts").withIndex("by_person", (q) => q.eq("personId", r.personId!)).collect();
        giftId = gifts.filter((g) => g.status === "suggested").sort((a, z) => z.at - a.at)[0]?._id ?? null;
      }
      out.push({ id: r._id, personId: r.personId ?? null, title: r.title, body: r.body, channel: r.channel, userKey: user.key, keikiOptIn: user.keikiOptIn, tokens: tokens.map((t) => t.token), giftId });
    }
    return out;
  },
});

async function postBatch(messages: object[]): Promise<Ticket[] | null> {
  const headers: Record<string, string> = { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) }).catch(() => null);
    if (res?.ok) return ((await res.json()) as { data: Ticket[] }).data;
    const retryable = !res || res.status === 429 || res.status >= 500;
    console.log(`notify: expo push failed ${res ? res.status : "network"} ${res ? await res.text() : ""}`);
    if (!retryable) return null;
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  return null;
}

export const dispatch = internalAction({
  args: {},
  handler: async (ctx): Promise<{ due: number; pushed: number; removedTokens: number; imessage: number }> => {
    await ctx.runMutation(internal.reminders.plan, {});
    const due = await ctx.runMutation(internal.notify.claimDue, { now: Date.now() });
    const summary = { due: due.length, pushed: 0, removedTokens: 0, imessage: 0 };
    if (!due.length) return summary;

    const messages = due.flatMap((r) =>
      r.tokens.map((to) => ({
        to,
        title: r.title,
        ...(r.body ? { body: r.body } : {}),
        sound: "default",
        collapseId: r.id,
        tag: r.id,
        data: { reminderId: r.id, personId: r.personId, url: r.personId ? `kin://person/${r.personId}` : "kin://reminders" },
      })),
    );
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const tickets = await postBatch(batch);
      if (!tickets) continue;
      for (const [j, ticket] of tickets.entries()) {
        if (ticket.status === "ok") summary.pushed++;
        else if (ticket.details?.error === "DeviceNotRegistered") {
          await ctx.runMutation(internal.pushTokens.remove, { token: batch[j].to });
          summary.removedTokens++;
        } else console.log(`notify: push ticket error ${ticket.details?.error ?? ""} ${ticket.message ?? ""}`);
      }
    }

    for (const r of due) {
      if (!r.tokens.length) console.log(`notify: no push tokens for ${r.userKey}; marked "${r.title}" sent, the device's local notification delivers it`);
      if (r.channel === "push" || !r.keikiOptIn) continue;
      if (!r.giftId) {
        console.log(`notify: no suggested gift for "${r.title}", skipped the Kin in Messages notice`);
        continue;
      }
      const notice = await ctx.runAction(api.keiki.sendBirthdayNotice, { userKey: r.userKey, giftId: r.giftId });
      if (notice.sent) summary.imessage++;
      else console.log(`notify: Kin in Messages notice not sent: ${notice.reason ?? "unknown"}`);
    }
    console.log(`notify.dispatch ${JSON.stringify(summary)}`);
    return summary;
  },
});
