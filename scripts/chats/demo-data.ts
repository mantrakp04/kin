/*
  Demo chat history for alex, consistent with convex/seedData.ts.
  npx tsx scripts/chats/demo-data.ts --env-file ~/.capy/work/bridge.env [--dry-run]
*/
import { readFileSync } from "node:fs";
import { threadsInChunks, type ChatMessage, type ChatThread } from "../../src/lib/chats/types";

const args = process.argv.slice(2);
const envFile = args[args.indexOf("--env-file") + 1];
if (args.includes("--env-file"))
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }

const NOW = Date.now();
const DAY = 86400000;
const NY_OFFSET = 5 * 3600000;
const todayNY = Math.floor((NOW - NY_OFFSET) / DAY) * DAY + NY_OFFSET;
const at = (daysAgo: number, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Math.min(NOW - 60000, todayNY - Math.round(daysAgo) * DAY + h * 3600000 + m * 60000);
};

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

type Line = [daysAgo: number, time: string, who: string, text: string];

function conversations(opts: { from: number; to: number; count: number; people: string[]; meStarts: number; me: string[]; them: string[] }): Line[] {
  const out: Line[] = [];
  for (let c = 0; c < opts.count; c++) {
    const day = Math.floor(opts.to + rand() * (opts.from - opts.to));
    let minute = 8 * 60 + Math.floor(rand() * 14 * 60);
    let fromMe = rand() < opts.meStarts;
    const n = 2 + Math.floor(rand() * 5);
    for (let i = 0; i < n && minute < 24 * 60 - 1; i++) {
      const who = fromMe ? "me" : pick(opts.people);
      out.push([day, Math.floor(minute / 60) + ":" + String(minute % 60).padStart(2, "0"), who, fromMe ? pick(opts.me) : pick(opts.them)]);
      minute += 1 + Math.floor(rand() * (rand() < 0.2 ? 90 : 12));
      fromMe = opts.people.length > 1 ? rand() < 0.3 : !fromMe;
    }
  }
  return out;
}

function thread(t: { id: string; title: string; isGroup: boolean; people: Record<string, { name?: string; phone?: string }>; lines: Line[] }): ChatThread {
  const participants = Object.entries(t.people).map(([key, p]) => ({ id: p.phone ?? "name:" + key, name: p.name, phone: p.phone }));
  const idOf = (who: string) => (t.people[who].phone ?? "name:" + who);
  const messages: ChatMessage[] = t.lines
    .map(([d, time, who, text], i) => ({ id: t.id + ":" + i, at: at(d, time), fromMe: who === "me", sender: who === "me" ? undefined : idOf(who), text }))
    .sort((a, b) => a.at - b.at);
  return { externalId: "demo:" + t.id, title: t.title, isGroup: t.isGroup, participants, messages };
}

const casualMe = ["haha yes", "100%", "how was your week", "ok that's amazing", "send pics", "omw", "lol stop", "same", "miss you", "wait really", "good luck today", "call later?", "that's so you", "deal"];

const maya = thread({
  id: "wa-maya",
  title: "Maya Chen",
  isGroup: false,
  people: { maya: { name: "Maya Chen" } },
  lines: [
    ...conversations({ from: 90, to: 31, count: 30, people: ["maya"], meStarts: 0.5, me: casualMe, them: ["matcha count today: 3", "SF fog is back", "went to the climbing gym after work", "developing a roll tonight", "lol", "how's NY", "you'd love this cafe", "ok goodnight"] }),
    ...conversations({ from: 30, to: 1, count: 48, people: ["maya"], meStarts: 0.5, me: casualMe, them: ["new roll just came back", "forearms are dead", "matcha #2", "this light today", "Figma offsite was fun actually", "reading the new Sally Rooney", "lol", "ok you have to come out to SF soon"] }),
    [13, "20:14", "maya", "finally sent the V5 at Mission Cliffs"],
    [13, "20:16", "me", "no way, congrats"],
    [12, "21:02", "maya", "ok I watched three reviews of the Kodak Ektar H35 and now I'm deep in a half-frame hole"],
    [12, "21:05", "me", "half-frame is twice the shots per roll right?"],
    [12, "21:06", "maya", "72 frames on a 36 roll. the Pentax 17 is the dream one but it's way too much to spend on myself"],
    [6, "13:40", "maya", "saved a roll someone shot on a half-frame and the diptychs are so good"],
    [2, "19:30", "me", "it's your birthday Monday. what's the plan"],
    [2, "19:34", "maya", "low key. matcha in the morning, dinner with the SF crew"],
    [2, "19:35", "maya", "27 is not a big deal I've decided"],
    [1, "22:10", "maya", "if anyone asks I still want a half-frame camera"],
    [1, "22:11", "maya", "kidding. mostly"],
    [0, "11:20", "me", "calling you tomorrow for the birthday"],
    [0, "11:24", "maya", "you better"],
  ],
});

const arjun = thread({
  id: "im-arjun",
  title: "Arjun Mehta",
  isGroup: false,
  people: { arjun: { phone: "+15555550121" } },
  lines: [
    ...conversations({ from: 90, to: 31, count: 34, people: ["arjun"], meStarts: 0.65, me: [...casualMe, "coffee this week?", "did you see the new Linear release"], them: ["type nerd moment: look at this kerning", "pour-over or nothing", "cricket was on until 2am", "design systems are 90% naming things", "ha", "yes", "Thursday works"] }),
    [41, "18:05", "arjun", "the Config deck is at 80 slides, send help"],
    [41, "18:09", "me", "cut it to 30 and it's a great talk"],
    [25, "09:12", "arjun", "big news: I'm joining Stripe as design lead"],
    [25, "09:15", "me", "that's huge, congrats"],
    [25, "09:16", "arjun", "starting in a couple of weeks"],
    [19, "21:30", "me", "how's the notice period going"],
    [18, "08:02", "arjun", "busy, sorry. will call soon"],
    [12, "19:44", "arjun", "first week at Stripe is a firehose. let's get coffee once things settle"],
    [12, "19:50", "me", "anytime, pour-over on me"],
  ],
});

const priya = thread({
  id: "im-priya",
  title: "Priya Nair",
  isGroup: false,
  people: { priya: { phone: "+15555550124" } },
  lines: [
    ...conversations({ from: 80, to: 3, count: 26, people: ["priya"], meStarts: 0.4, me: casualMe, them: ["long run this morning, legs gone", "made a huge pot of rasam", "new podcast rec incoming", "EV nerd stuff, you wouldn't care lol", "how's work", "ha", "ok night"] }),
    [20, "18:20", "priya", "the Giga Texas offer came through. I'm taking it"],
    [20, "18:21", "priya", "moving to Austin at the end of the month"],
    [20, "18:25", "me", "Priya that's amazing"],
    [8, "20:02", "priya", "first week at Giga Texas done. the battery lab is enormous"],
    [2, "17:45", "priya", "officially moved to Austin. boxes everywhere"],
    [2, "17:46", "priya", "found a trail running group that goes out on Saturdays"],
    [2, "17:52", "me", "come visit New York in the spring?"],
    [2, "17:55", "priya", "only if you come to Austin first and eat my dal"],
    [1, "12:30", "priya", "it's 80 degrees in November here, I'm confused"],
  ],
});

const sofia = thread({
  id: "wa-sofia",
  title: "Sofia Ruiz",
  isGroup: false,
  people: { sofia: { name: "Sofia Ruiz" } },
  lines: [
    ...conversations({ from: 85, to: 2, count: 24, people: ["sofia"], meStarts: 0.45, me: casualMe, them: ["shooting all day tomorrow", "found the best natural wine bar", "ceramics class was a disaster lol", "proofs are in", "ha yes", "ok bed"] }),
    [16, "15:10", "sofia", "Kinfolk shoot in Brooklyn wrapped"],
    [10, "11:00", "sofia", "booked Lisbon. I'm there until the 28th, shooting portraits in Alfama"],
    [10, "11:04", "me", "so jealous"],
    [4, "14:30", "sofia", "the light in Lisbon is unreal"],
    [1, "16:20", "sofia", "posted the Alfama series"],
    [1, "16:31", "me", "they're beautiful. drinks when you're back?"],
    [1, "16:40", "sofia", "yes. natural wine on Sunday the 29th?"],
    [1, "16:41", "me", "done"],
  ],
});

const leo = thread({
  id: "wa-leo",
  title: "Leo Park",
  isGroup: false,
  people: { leo: { name: "Leo Park" } },
  lines: [
    ...conversations({ from: 75, to: 1, count: 26, people: ["leo"], meStarts: 0.55, me: casualMe, them: ["new synth arrived", "k-bbq this week?", "investor meetings all day", "biked over the bridge, freezing", "ha", "yes", "let's do it"] }),
    [8, "22:15", "leo", "we closed the seed round"],
    [8, "22:16", "me", "LEO. congrats"],
    [3, "10:05", "leo", "launch drinks for Tiny Labs this Friday at 7, in Brooklyn. you're coming"],
    [3, "10:07", "me", "wouldn't miss it"],
    [0, "09:40", "leo", "bring Daniel if he's free Friday"],
  ],
});

const daniel = thread({
  id: "im-daniel",
  title: "Daniel Brooks",
  isGroup: false,
  people: { daniel: { phone: "+15555550127" } },
  lines: [
    ...conversations({ from: 60, to: 4, count: 16, people: ["daniel"], meStarts: 0.4, me: casualMe, them: ["espresso machine finally dialed in", "rode in this morning", "reading a new sci-fi book", "jazz at Smalls Thursday?", "ha", "sure"] }),
    [5, "20:00", "daniel", "rode 100 miles from Brooklyn to Montauk today"],
    [5, "20:12", "me", "you're unwell. congrats"],
    [4, "09:30", "daniel", "legs still recovering lol"],
  ],
});

const climbing = thread({
  id: "im-climbing",
  title: "Crux crew",
  isGroup: true,
  people: { grace: { phone: "+15555550134" }, ben: { phone: "+15555550131" }, daniel: { phone: "+15555550127" } },
  lines: [
    ...conversations({ from: 60, to: 1, count: 40, people: ["grace", "ben", "daniel"], meStarts: 0.25, me: ["I'm in", "Thursday works", "who's driving", "my fingers hate me", "lol"], them: ["session Thursday at 7?", "Brooklyn Boulders or Vital?", "new set on the overhang wall", "I'm in", "skin is gone", "Grace when are you back in NY", "lol", "ok see you there"] }),
    [3, "21:00", "ben", "Grace sent a 5.11 at Rumney!"],
    [3, "21:02", "grace", "still shaking"],
    [3, "21:03", "me", "huge, congrats"],
  ],
});

const college = thread({
  id: "wa-college",
  title: "Penn '16",
  isGroup: true,
  people: { hannah: { name: "Hannah Lee" }, olivia: { name: "Olivia Grant" }, ethan: { name: "Ethan Cole" }, rachel: { name: "Rachel Adler" } },
  lines: conversations({
    from: 90,
    to: 1,
    count: 70,
    people: ["hannah", "olivia", "ethan", "rachel", "rachel"],
    meStarts: 0.15,
    me: ["lol", "I'm in", "this chat is chaos", "miss you all"],
    them: ["remember the Quad in the snow", "reunion planning thread, go", "who's around for Thanksgiving", "book club pick: something short please", "new crossword PR", "vinyl haul this weekend", "lol", "same", "Ethan you're never online", "ok I love this group"],
  }),
});

const threads = { whatsapp: [maya, sofia, leo, college], imessage: [arjun, priya, daniel, climbing] };

async function post(source: "whatsapp" | "imessage", via: string, list: ChatThread[]) {
  for (const chunk of threadsInChunks(list)) {
    const res = await fetch(process.env.CONVEX_SITE_URL!.replace(/\/$/, "") + "/chats/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.BRIDGE_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify({ userKey: "alex", source, via, threads: chunk }),
    });
    console.log(source, res.status, await res.text());
  }
}

async function main() {
  for (const [k, list] of Object.entries(threads)) console.log(k, list.map((t) => [t.title, t.messages.length]));
  if (args.includes("--dry-run")) return;
  await post("whatsapp", "export", threads.whatsapp);
  await post("imessage", "chatdb", threads.imessage);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
