# Stories

Stories turn one day of your people's updates, from synced socials (Instagram, LinkedIn, X, Strava) and phone contacts, into a TikTok-style playlist of short vertical reels: one Story per day (Today, Yesterday, Fri...), one reel per style, all about that day's real updates. Reels are pre-rendered MP4s made the way the reel-style specs describe (`~/.capy/work/reel-styles/<style>/SKILL.md`), stored in Convex and played full screen with expo-video. Reels without a video fall back to the on-device procedural renderer.

## Flow

1. **Collect.** `stories.start` (from `stories.generate`, the 07:00 local cron `stories.dailyTick`, or the Stories row on first open) gathers that day's updates in the user's time zone. Today's story also includes birthdays and events within 7 days. Sensitive updates (health, grief, breakups, money, legal) are dropped before Claude sees them. Each item keeps `updateId` so per-update assets can be cached.
2. **Script.** One `reels` row per style; `stories.generateReel` asks Claude for a structured script (`title`, `overlay`, `characters`, `turns` with `speaker`, spoken `text`, on-screen `caption`, `person`, `beat`). The shared prompt is `prompts/stories/system.md` (mirrored as `STORY_SYSTEM` in `convex/stories.ts`); per-style rules are in `convex/storyStyles.ts`. Scripts may say where something came from ("Sofia posted from Lisbon").
3. **Render.** `scripts/reels/render.py` (Python 3 + Pillow + numpy + faster-whisper + ffmpeg) renders each reel to a 1080x1920, 30 fps, H.264 yuv420p, AAC 48 kHz, faststart MP4 at -16 LUFS, uploads it through `stories:videoUploadUrl` and attaches it with `stories:setVideo`. See Operating below.
4. **Play.** `/story/[id]` pages through ready reels. Reels with `videoUrl` play in expo-video; swipe up for next, swipe down for previous (or close on the first reel), hold to pause, tap to toggle mute, × to close. The modal's own swipe-to-dismiss is disabled so swipes only page.

## Render pipeline

- **Voices:** Fish Audio (`POST https://api.fish.audio/v1/tts`, header `model: s2.1-pro-free`), one request per turn, cached as `turn-NN.mp3` with a receipt; a changed line re-synthesises only that turn. Voices: Peter, Stewie, Brian, Rick, Morty (character voice models), Adrian narrator, an OIIA cat voice and a dry British capybara.
- **Word timing:** local faster-whisper `base.en` on CPU, aligned to the script words with difflib, so captions follow the actual audio.
- **Pictures:** each mentioned person appears as a platform-styled post card for the update's source: Instagram photo post (avatar ring, handle, location, likes, caption), LinkedIn "Started a new position" card, X post, Strava activity (distance, time, pace, route map), and calendar or invite cards for birthdays and events.
- **Post photos:** Instagram and Strava updates have no photos, so the renderer picks one freely licensed Wikimedia Commons photo per update (Claude Haiku writes the search query, Quality Images preferred) and caches it in Convex storage in `updatePhotos` keyed by update id with its credit line. `stories:get` returns it as `postPhotoUrl` on each item, so it is reused across reels and days. ElevenLabs image generation (`/v1/flows/image`) needs a Pro plan; the current Creator key gets `402 paid_plan_required`, so the same slot can take generated images later.
- **Library assets** (one time, `~/.capy/work/reel-assets`): Minecraft parkour gameplay, Family Guy and Rick and Morty cutouts, OIIA cat greenscreen and remix audio, spinning-animal greenscreens, rave and club clips, beats, phonk, swishes and pops, TikTok Sans and Anton. Everyday backgrounds for text posts and carousels come from Wikimedia Commons and are cached in `~/.capy/work/reel-render/cache`.

| Style | Render |
| --- | --- |
| company-character-gameplay | Peter and Stewie (Fish) over parkour; post card at y 135-665; Anton yellow captions with the active word black on a white box; swish on picture changes |
| company-gameplay-stories | Reddit card for 6 s, then post cards; narrator; 3-word white phrases with names in yellow |
| brainrot-rap-reels | 6 bars, Rick and Morty on a neon laser loop with the hard rap beat; white bold italic bars; idle rapper dimmed |
| spinning-animal-reels | white stage, chroma-keyed OIIA cat that spins on detected beats of the FE!N remix hook; setup/drop text plus black phonetic cues |
| dancing-dogs-reel | needs the dancing dogs clip (not sourced yet) |
| surreal-rave-reels | club crowd clip, hook in TikTok Sans, one line per person below; techno track |
| surreal-animal-action-reels | spinning 3D dog greenscreen on a disco floor, timed bold lines, phonk |
| animal-selfie-reels | capybara monologue (Fish), word-highlight captions over a capybara photo |
| company-ai-meme-videos | the day's post cards as talking objects with googly eyes; two Fish voices; subtitles with speaker tags |
| company-ugc-dodo-style, company-ugc-posts, freecode-reel-workflow | one dense TikTok Sans block (55 px, 4 px outline) over an everyday photo |
| website-reel-remakes | caption above a laptop showing each post card, over a desk photo |
| company-photo-carousel, company-brand-posts, company-launch-videos | 6 slides: photo carousel with dots; Kin-style serif headlines with cards; dark grid with orange glow and word-by-word serif reveal |

## Keys

| Env var | Where | Used for |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Convex and render machine | scripts (Claude) and Commons search queries (Haiku) |
| `FISH_API_KEY` | render machine (`~/.capy/work/fish.env`) | reel voices |
| `ELEVENLABS_API_KEY` | Convex | legacy on-device fallback voices and sound library; image and video generation need a Pro plan |
| deploy key | render machine (`~/.capy/work/convex-deploy.env`) | `npx convex run` for reading stories and uploading videos |

## Operating

```bash
# render today's story for alex (skips reels that already have video)
~/.capy/work/reel-render/.venv/bin/python scripts/reels/render.py --user alex
# re-render chosen styles, or preview without uploading
~/.capy/work/reel-render/.venv/bin/python scripts/reels/render.py --user alex --styles brainrot-rap-reels --force
~/.capy/work/reel-render/.venv/bin/python scripts/reels/render.py --user alex --styles company-character-gameplay --no-upload
# scripts
npx convex run stories:generate '{"userKey":"alex"}'
```

Each job writes `reel.mp4` plus start, middle and end stills to `~/.capy/work/reel-render/jobs/<storyId>/<style>/`. `stories:start` with `force` deletes reels, uploaded videos included.

Native modules: `expo-audio`, `expo-video`, `expo-speech` (rebuild the dev client).

## IP note

The character-gameplay and rap styles use Family Guy and Rick and Morty cutouts and Fish community character voices, and the OIIA reel uses the meme remix. That is fine for a hackathon demo but is a copyright, trademark and right-of-publicity risk in a shipped product; replace them with original characters, licensed music and original voices before launch.
