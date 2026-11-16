export type StyleId =
  | "company-character-gameplay"
  | "company-gameplay-stories"
  | "brainrot-rap-reels"
  | "spinning-animal-reels"
  | "dancing-dogs-reel"
  | "surreal-rave-reels"
  | "surreal-animal-action-reels"
  | "animal-selfie-reels"
  | "company-ai-meme-videos"
  | "company-ugc-dodo-style"
  | "company-ugc-posts"
  | "website-reel-remakes"
  | "freecode-reel-workflow"
  | "company-photo-carousel"
  | "company-brand-posts"
  | "company-launch-videos";

export type Format = "dialogue" | "narration" | "rap" | "phonetic" | "selfie" | "text" | "slides";
export type BackgroundKind = "gameplay" | "animal-loop" | "rave" | "ugc" | "slides" | "animated-cards";
export type Scene =
  | "parkour"
  | "nether-run"
  | "rap-stage"
  | "disco-cat"
  | "dogs"
  | "rave"
  | "cow-spin"
  | "water-selfie"
  | "meme-world"
  | "dark-room"
  | "kitchen"
  | "laptop"
  | "eye-roll"
  | "photo"
  | "brand"
  | "launch";
export type CaptionStyle =
  | "yellow-highlight"
  | "reddit"
  | "bold-italic"
  | "phonetic"
  | "white-highlight"
  | "subtitle"
  | "hook"
  | "timed-hook"
  | "block-cream"
  | "block-white"
  | "screen"
  | "slide-photo"
  | "slide-graphic"
  | "launch-type";
export type Music = "none" | "beat101" | "beat128" | "pad";

export type Voice = {
  eleven?: string;
  speed?: number;
  stability?: number;
  device: { pitch: number; rate: number; language?: string };
};

export type CastMember = {
  id: string;
  name: string;
  role: string;
  color: string;
  side: "left" | "right" | "center";
  voice: Voice;
};

export type StoryStyle = {
  id: StyleId;
  name: string;
  label: string;
  format: Format;
  cast: CastMember[];
  background: { kind: BackgroundKind; scene: Scene; palette: [string, string, string] };
  caption: CaptionStyle;
  seconds: [number, number];
  words: [number, number];
  music: Music;
  sfx: "swish" | "none";
  rules: string;
};

export const TTS_MODEL = "eleven_flash_v2_5";
export const TTS_CREDITS_PER_CHAR = 0.5;

const ELEVEN = {
  adam: "pNInz6obpgDQGcFmaJgB",
  daniel: "onwK4e9ZLuTAKqWW03F9",
  callum: "N2lVS1w4EtoT3dr4eOWO",
  liam: "TX3LPaxmHKxFdv7VOQHJ",
  will: "bIHbv24MWmeRgasZH58o",
  jessica: "cgSgspJ2msm6clMCkdW9",
  george: "JBFqnCBsd6RMkjVDRZzb",
  harry: "SOYHLrjzK2X1ezoPC6cr",
  laura: "FGY2WhTYpPnrIDTdsKH5",
} as const;

const lines = (...parts: string[]) => parts.join("\n");

const peter: CastMember = {
  id: "peter",
  name: "Peter",
  role: "loud, confidently wrong explainer who treats small news like a huge deal",
  color: "#F2C14E",
  side: "left",
  voice: { eleven: ELEVEN.adam, stability: 0.3, device: { pitch: 0.8, rate: 0.95, language: "en-US" } },
};
const stewie: CastMember = {
  id: "stewie",
  name: "Stewie",
  role: "posh, sceptical baby genius who corrects everyone",
  color: "#E5533D",
  side: "right",
  voice: { eleven: ELEVEN.daniel, stability: 0.35, device: { pitch: 1.35, rate: 1.05, language: "en-GB" } },
};
const rick: CastMember = {
  id: "rick",
  name: "Rick",
  role: "chaotic genius grandpa who raps fast and brags",
  color: "#9EE6F0",
  side: "left",
  voice: { eleven: ELEVEN.callum, speed: 1.1, stability: 0.3, device: { pitch: 0.75, rate: 1.1, language: "en-US" } },
};
const morty: CastMember = {
  id: "morty",
  name: "Morty",
  role: "anxious teen sidekick who raps nervously and keeps up anyway",
  color: "#F7D44C",
  side: "right",
  voice: { eleven: ELEVEN.liam, speed: 1.1, stability: 0.3, device: { pitch: 1.4, rate: 1.1, language: "en-US" } },
};
const narrator: CastMember = {
  id: "narrator",
  name: "Narrator",
  role: "casual Reddit story narrator, fast and deadpan",
  color: "#FFFFFF",
  side: "center",
  voice: { eleven: ELEVEN.will, speed: 1.1, device: { pitch: 1.0, rate: 1.12, language: "en-US" } },
};
const text: CastMember = { id: "text", name: "Text", role: "on-screen text only, never spoken", color: "#FFFFFF", side: "center", voice: { device: { pitch: 1, rate: 1 } } };

const TEXT_ONLY = "Turns are on-screen text only, never spoken. Use speaker \"text\" and put the same words in text and caption.";
const SLIDES = "Slides are on-screen only, never spoken. Use speaker \"text\". caption is the headline; text is the smaller supporting line (an empty string when the style has none).";

export const STYLES: StoryStyle[] = [
  {
    id: "company-character-gameplay",
    name: "Peter and Stewie over parkour",
    label: "parkour",
    format: "dialogue",
    cast: [peter, stewie],
    background: {
      kind: "gameplay",
      scene: "parkour",
      palette: ["#7EC8F2", "#5DAA3A", "#7A5230"],
    },
    caption: "yellow-highlight",
    seconds: [25, 40],
    words: [70, 100],
    music: "none",
    sfx: "swish",
    rules: lines(
      "Two characters in conversation, speakers \"peter\" and \"stewie\", alternating short turns with interruptions. Peter is the confident explainer whose framing is over the top (never the facts); Stewie is the posh sceptic who corrects him.",
      "Start directly with a concrete claim, complaint or question about one real update. No greetings or introductions.",
      "Let the other character challenge or misunderstand it, escalate with an exaggerated analogy, then work the other real updates in as answers.",
      "Return to the opening joke with a callback or reversal at the end.",
      "Simple conversational English in each character's cadence; no catchphrase spam, burps or stutters. Captions show 2 to 5 word phrases, so keep sentences short and put the punchline at the end of a turn.",
      "Set person on every turn that is about a contact so their picture pops above the captions; move to a new update every 2 to 5 seconds.",
    ),
  },
  {
    id: "company-gameplay-stories",
    name: "Reddit story over gameplay",
    label: "reddit",
    format: "narration",
    cast: [narrator],
    background: {
      kind: "gameplay",
      scene: "nether-run",
      palette: ["#2A0C0C", "#B5361E", "#F2A33A"],
    },
    caption: "reddit",
    seconds: [25, 38],
    words: [60, 90],
    music: "none",
    sfx: "none",
    rules: lines(
      "One narrator (speaker \"narrator\") telling a Reddit-style first-person story from the viewer's point of view about what their people did that day.",
      "Hook: a concrete contradiction or consequence in the first sentence (for example: my group chat had more news in one day than I had all month).",
      "Escalation: each next real update makes it bigger or funnier. Reddit touches like \"bro\" or a quoted text are fine for the viewer's own voice; never invent ages, quotes or reactions for contacts.",
      "Payoff: return to the opening and end with a callback or a dry funny line, ideally a small next step for the viewer (text them, save the date).",
      "title is the opening Reddit card: one line under 12 words that sets up the story.",
      "Each turn is one or two sentences; captions are shown as 3 to 4 word phrases.",
    ),
  },
  {
    id: "brainrot-rap-reels",
    name: "Rick and Morty rap",
    label: "rap",
    format: "rap",
    cast: [rick, morty],
    background: {
      kind: "rave",
      scene: "rap-stage",
      palette: ["#0B0F1A", "#42F59E", "#9EE6F0"],
    },
    caption: "bold-italic",
    seconds: [13, 18],
    words: [45, 70],
    music: "beat101",
    sfx: "none",
    rules: lines(
      "Exactly six bars over a 101 BPM beat, about 2.4 seconds each, speakers in this order: rick, rick, morty, morty, rick, morty.",
      "Each bar is one line of 7 to 12 words with a strong rhyme on the last word; bars rhyme in pairs. Original lyrics only, never lines from existing songs.",
      "Every bar names a real contact and their real update (job, trip, race, move). Hype them up like hype men: kind and funny, never a diss.",
      "caption is the bar exactly as shown on screen, one bar at a time.",
    ),
  },
  {
    id: "spinning-animal-reels",
    name: "OIIA spinning cat",
    label: "oiia",
    format: "phonetic",
    cast: [
      {
        id: "cat",
        name: "Cat",
        role: "the spinning cat that only sings phonetic syllables",
        color: "#F4F4F4",
        side: "center",
        voice: { eleven: ELEVEN.jessica, speed: 1.15, stability: 0.25, device: { pitch: 1.7, rate: 1.25, language: "en-US" } },
      },
    ],
    background: {
      kind: "animal-loop",
      scene: "disco-cat",
      palette: ["#FFFFFF", "#FF4FA3", "#4FD8FF"],
    },
    caption: "phonetic",
    seconds: [10, 18],
    words: [8, 24],
    music: "beat128",
    sfx: "none",
    rules: lines(
      "The OIIA spinning-cat meme. overlay has exactly two short lines in casual lowercase meme voice: overlay[0] is the setup shown before the drop (me finding out arjun started at stripe today), overlay[1] is the drop punchline shown while the cat spins.",
      "turns are 5 to 8 short phonetic syllable groups the cat sings on the beat (speaker \"cat\"): text is how to pronounce it (\"oo ee ee ah ee\"), caption is how it is displayed (\"u i i a i\", lowercase letters separated by spaces).",
      "The first turn has beat \"setup\"; the rest have beat \"drop\". Set person on drop turns to the contact each drop is about, cycling through the real updates.",
    ),
  },
  {
    id: "dancing-dogs-reel",
    name: "Dancing with my dogs",
    label: "dogs",
    format: "text",
    cast: [text],
    background: {
      kind: "animal-loop",
      scene: "dogs",
      palette: ["#F3D9B1", "#C98B4B", "#6B4226"],
    },
    caption: "hook",
    seconds: [9, 12],
    words: [14, 26],
    music: "beat128",
    sfx: "none",
    rules: lines(
      TEXT_ONLY,
      "One meme caption in lowercase, 3 or 4 balanced lines, shown above the dancers for the whole clip. Pattern: me and my dogs when ... celebrating the day's real updates as if they were our own wins.",
      "Put the caption in overlay, one line per element. turns: one per contact mentioned (caption = first name plus a 2 to 5 word summary) so their picture pops while the dogs dance.",
    ),
  },
  {
    id: "surreal-rave-reels",
    name: "Surreal rave",
    label: "rave",
    format: "text",
    cast: [text],
    background: {
      kind: "rave",
      scene: "rave",
      palette: ["#05060A", "#C9D6E8", "#7CFFB2"],
    },
    caption: "hook",
    seconds: [14, 17],
    words: [12, 24],
    music: "beat128",
    sfx: "none",
    rules: lines(
      TEXT_ONLY,
      "overlay: two hook lines plus an optional separated punchline, static centred white text in the top black bar. Pattern: me and the boys when ... celebrating the day's real updates. No karaoke, no outro.",
      "turns: one per contact (caption = first name plus a 2 to 5 word summary) so their picture flashes on the beat.",
    ),
  },
  {
    id: "surreal-animal-action-reels",
    name: "Cow does a stunt",
    label: "stunt",
    format: "text",
    cast: [text],
    background: {
      kind: "animal-loop",
      scene: "cow-spin",
      palette: ["#8FD3FF", "#FF4FD8", "#FFD24F"],
    },
    caption: "timed-hook",
    seconds: [9, 12],
    words: [12, 24],
    music: "beat128",
    sfx: "swish",
    rules: lines(
      TEXT_ONLY,
      "Bold white text in the sky above an impossible animal stunt. 2 or 3 timed lines: the first (beat \"setup\") sets up a real update in plain words, the next (beat \"drop\") lands when the cow spins and the effects burst, as the reaction (me when arjun said design lead at stripe / the cow understood). overlay: [].",
      "Set person on each line that is about a contact.",
    ),
  },
  {
    id: "animal-selfie-reels",
    name: "Capybara water selfie",
    label: "selfie",
    format: "selfie",
    cast: [
      {
        id: "capybara",
        name: "Capybara",
        role: "deadpan capybara filming a selfie while floating in a lake, absurdly confident opinions",
        color: "#B07A4A",
        side: "center",
        voice: { eleven: ELEVEN.george, stability: 0.5, device: { pitch: 0.9, rate: 0.98, language: "en-GB" } },
      },
    ],
    background: {
      kind: "animal-loop",
      scene: "water-selfie",
      palette: ["#7EC8E3", "#2F7FA6", "#E9D8A6"],
    },
    caption: "white-highlight",
    seconds: [9, 14],
    words: [22, 36],
    music: "none",
    sfx: "none",
    rules: lines(
      "One talking capybara (speaker \"capybara\") filming a water selfie. Compact setup, escalation and punchline in 2 to 4 short turns, plus a short reaction turn at the end (anyway.).",
      "Use the animal in the joke: it is floating in a lake while everyone else is doing big things. Dry comic delivery, simple words.",
      "Mention at most the two or three biggest real updates. Captions highlight word by word.",
    ),
  },
  {
    id: "company-ai-meme-videos",
    name: "Absurd AI meme",
    label: "meme",
    format: "dialogue",
    cast: [
      {
        id: "a",
        name: "Object A",
        role: "an anthropomorphic object or animal tied to one update (a moving box, a passport, a running shoe)",
        color: "#FF9F68",
        side: "left",
        voice: { eleven: ELEVEN.harry, stability: 0.3, device: { pitch: 1.2, rate: 1.05, language: "en-GB" } },
      },
      {
        id: "b",
        name: "Object B",
        role: "a second character who reacts (a robot duck, a houseplant, a calendar)",
        color: "#7FD1AE",
        side: "right",
        voice: { eleven: ELEVEN.laura, stability: 0.35, device: { pitch: 0.85, rate: 1.0, language: "en-US" } },
      },
    ],
    background: {
      kind: "animal-loop",
      scene: "meme-world",
      palette: ["#FDE2F3", "#B6E3FF", "#FFE9A8"],
    },
    caption: "subtitle",
    seconds: [10, 16],
    words: [22, 40],
    music: "none",
    sfx: "swish",
    rules: lines(
      "Invent one absurd physical scene where an object or animal is affected by one real update (Sofia's suitcase packing itself for Lisbon, Arjun's old lanyard getting evicted). characters gives the display names for ids \"a\" and \"b\"; speakers are \"a\" and \"b\".",
      "Two or three short lines plus a reaction; leave a beat before the punchline. A physical payoff beats a clever line. The scene must be about a real update; fold one or two more updates into the payoff if they fit.",
    ),
  },
  {
    id: "company-ugc-dodo-style",
    name: "Confession post",
    label: "confession",
    format: "text",
    cast: [text],
    background: {
      kind: "ugc",
      scene: "dark-room",
      palette: ["#2B1D14", "#6E4A2E", "#FFE568"],
    },
    caption: "block-cream",
    seconds: [10, 14],
    words: [40, 70],
    music: "pad",
    sfx: "none",
    rules: lines(
      TEXT_ONLY,
      "A dense first-person confession paragraph in casual lowercase over dark everyday footage, shown all at once. Formats that work: office confession, tiny win, quoted conversation, pov. Start with a specific social situation the viewer recognises (i opened my phone for one second and found out), then the real updates as escalating details, then a dry ending that finishes the human story.",
      "Put the paragraph in overlay, one sentence per element. turns: one per contact (caption = first name) so pictures pop softly.",
    ),
  },
  {
    id: "company-ugc-posts",
    name: "POV over everyday clip",
    label: "pov",
    format: "text",
    cast: [text],
    background: {
      kind: "ugc",
      scene: "kitchen",
      palette: ["#E8E2D6", "#9AB7C9", "#FFFFFF"],
    },
    caption: "block-white",
    seconds: [8, 13],
    words: [25, 55],
    music: "pad",
    sfx: "none",
    rules: lines(
      TEXT_ONLY,
      "White outlined text block over an everyday chore clip. One main thought: a small realisation, a pov or when situation, or a hot take about keeping up with people. Each overlay element is a line; use an empty string for a blank line between paragraphs.",
      "End with a concrete next step in the same voice that resolves it (text maya happy birthday before 9am). turns: one per contact (caption = first name).",
    ),
  },
  {
    id: "website-reel-remakes",
    name: "Reaction to the laptop",
    label: "screens",
    format: "slides",
    cast: [text],
    background: {
      kind: "animated-cards",
      scene: "laptop",
      palette: ["#1C1B22", "#3139FB", "#F4F3FA"],
    },
    caption: "screen",
    seconds: [8, 12],
    words: [18, 40],
    music: "beat128",
    sfx: "swish",
    rules: lines(
      SLIDES,
      "A 3-second reaction opener, then quick screen views. Turn 0 is the reaction caption (beat \"setup\", person \"\"), for example: wait what happened today. Each next turn is one screen showing one real update card: caption is a 3 to 7 word line about that update, text is \"\", person is that contact. 3 or 4 screens in total.",
    ),
  },
  {
    id: "freecode-reel-workflow",
    name: "Eye-roll reaction",
    label: "reaction",
    format: "text",
    cast: [text],
    background: {
      kind: "ugc",
      scene: "eye-roll",
      palette: ["#D8CFC4", "#6C7A89", "#FFFFFF"],
    },
    caption: "block-white",
    seconds: [8, 12],
    words: [28, 45],
    music: "beat128",
    sfx: "none",
    rules: lines(
      TEXT_ONLY,
      "Static white outlined text, centred, over a face that rolls its eyes in the first second. Start with a specific recognisable social moment (my mom asking if i have talked to anyone lately), then the real updates as the reveal, and a dry ending that completes the situation. Casual lowercase, 30 to 45 words.",
      "Put the text in overlay, one line per element. turns: one per contact (caption = first name).",
    ),
  },
  {
    id: "company-photo-carousel",
    name: "Photo carousel",
    label: "carousel",
    format: "slides",
    cast: [text],
    background: {
      kind: "slides",
      scene: "photo",
      palette: ["#F6EFE7", "#1B1A22", "#E9785A"],
    },
    caption: "slide-photo",
    seconds: [14, 20],
    words: [40, 90],
    music: "pad",
    sfx: "swish",
    rules: lines(
      SLIDES,
      "A six-slide photo carousel. Slide 1 is the hook (how much happened); slides 2 to 5 cover one real update each (the biggest ones); slide 6 is one clear next action for the viewer (reach out, save a date). caption = headline of 4 to 12 words; text = supporting line of 10 to 25 words. person = that slide's contact or \"\".",
    ),
  },
  {
    id: "company-brand-posts",
    name: "Graphic posts",
    label: "graphic",
    format: "slides",
    cast: [text],
    background: {
      kind: "slides",
      scene: "brand",
      palette: ["#EFEEFC", "#3139FB", "#1B1A22"],
    },
    caption: "slide-graphic",
    seconds: [14, 20],
    words: [40, 90],
    music: "pad",
    sfx: "swish",
    rules: lines(
      SLIDES,
      "Six flat graphic slides in Kin's calm style. Slide 1 hook, slides 2 to 5 each explain one real update (the app draws a purposeful graphic: a route for trips, a pin for moves, a big number for race times, a badge for jobs), slide 6 one next action. caption = headline of 4 to 12 words; text = 10 to 25 words. person = that slide's contact or \"\".",
    ),
  },
  {
    id: "company-launch-videos",
    name: "Launch film",
    label: "launch",
    format: "slides",
    cast: [text],
    background: {
      kind: "animated-cards",
      scene: "launch",
      palette: ["#0E0D12", "#F4F3FA", "#FF844F"],
    },
    caption: "launch-type",
    seconds: [18, 28],
    words: [30, 70],
    music: "pad",
    sfx: "none",
    rules: lines(
      SLIDES,
      "A polished, restrained launch film where the launch is the day's news about the viewer's people. One idea per scene: a hook (today, in your people), a reveal per real update in launch language (introducing: arjun, design lead at stripe), and a closing next step for the viewer. 4 to 6 scenes. caption = the main line of 2 to 8 words; text = a small supporting line of up to 12 words or \"\". person = that scene's contact or \"\".",
    ),
  },
];

export const VOICE_PRIORITY: StyleId[] = [
  "company-character-gameplay",
  "brainrot-rap-reels",
  ...STYLES.map((s) => s.id).filter((id) => id !== "company-character-gameplay" && id !== "brainrot-rap-reels"),
];

export type SoundKey = "swish" | "pop" | "spin" | Exclude<Music, "none">;

export const SOUNDS: { key: SoundKey; prompt: string; seconds: number; loop: boolean }[] = [
  { key: "swish", prompt: "short airy whoosh swish for a picture change in a social video", seconds: 0.5, loop: false },
  { key: "pop", prompt: "bubbly cartoon pop", seconds: 0.5, loop: false },
  { key: "spin", prompt: "fast cartoon spinning whoosh, rising pitch", seconds: 1, loop: false },
  { key: "beat101", prompt: "boom bap hip hop drum loop with sub bass, 101 bpm, no vocals", seconds: 4.75, loop: true },
  { key: "beat128", prompt: "four on the floor techno rave drum loop with bassline, 128 bpm, no vocals", seconds: 3.75, loop: true },
  { key: "pad", prompt: "soft warm ambient synth pad loop, calm, no drums", seconds: 8, loop: true },
];

export const SFX_CREDITS_PER_SECOND = 40;

export const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s])) as Record<StyleId, StoryStyle>;

export function isSpoken(style: StoryStyle) {
  return style.format !== "text" && style.format !== "slides";
}
