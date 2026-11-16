#!/usr/bin/env python3
"""Render Kin Stories reels to MP4 per the reel-style specs, then upload to Convex.

Run with the render venv:
  ~/.capy/work/reel-render/.venv/bin/python scripts/reels/render.py --user alex [--styles a,b] [--force]
"""
import argparse
import colorsys
import difflib
import glob
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HOME = Path.home() / ".capy" / "work"
ASSETS = HOME / "reel-assets"
WORK = HOME / "reel-render"
FONTS = WORK / "fonts"
REPO = Path(__file__).resolve().parents[2]
W, H, FPS, SR = 1080, 1920, 30, 48000

ORDER = [
    "company-character-gameplay",
    "company-gameplay-stories",
    "brainrot-rap-reels",
    "spinning-animal-reels",
    "dancing-dogs-reel",
    "surreal-rave-reels",
    "surreal-animal-action-reels",
    "animal-selfie-reels",
    "company-ai-meme-videos",
    "company-ugc-dodo-style",
    "company-ugc-posts",
    "website-reel-remakes",
    "freecode-reel-workflow",
    "company-photo-carousel",
    "company-brand-posts",
    "company-launch-videos",
]

VOICES = {
    "peter": ("b1d36a18f8d84bd59dead30474cbe3d7", 1.0),
    "stewie": ("a38c07580dca455788c9ebe5ef71c3ed", 1.0),
    "brian": ("e88928ec5022418cad0606fcfc809b8a", 1.0),
    "rick": ("64496e0d65734db1b1801290fe539277", 1.1),
    "morty": ("e942a808b1e7499087fe5b401039310a", 1.1),
    "narrator": ("bf322df2096a46f18c579d0baa36f41d", 1.15),
    "cat": ("7062095d05e643a2bd2233ebe4a6abd3", 1.2),
    "capybara": ("d33bd87d47a04c2eada3c5438047e32d", 1.05),
    "a": ("e88928ec5022418cad0606fcfc809b8a", 1.0),
    "b": ("e942a808b1e7499087fe5b401039310a", 1.0),
}

CAST_LAYOUT = {
    "peter": {"side": "left", "width": 440},
    "stewie": {"side": "right", "width": 445},
    "rick": {"side": "left", "width": 520, "mirror": True},
    "morty": {"side": "right", "width": 400, "mirror": True},
}

POSES = {"peter": "peter-shrug-talking", "stewie": "stewie-arms-crossed", "rick": "rick-arms-raised", "morty": "morty-shocked"}

YELLOW = (255, 232, 59, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def env_file(name):
    out = {}
    for line in (HOME / name).read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip().replace("export ", "")] = v.strip().strip('"').strip("'")
    return out


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError("command failed: " + " ".join(map(str, cmd))[:300] + "\n" + r.stderr[-1500:])
    return r.stdout


def convex(fn, args):
    out = run(["npx", "convex", "run", "--env-file", str(HOME / "convex-deploy.env"), fn, json.dumps(args)], cwd=REPO)
    out = out.strip()
    return json.loads(out) if out else None


def probe_duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)]).strip())


# ---------- assets ----------

def manifest():
    p = ASSETS / "manifest.json"
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def find_asset(*patterns, folders=("",)):
    for folder in folders:
        for pat in patterns:
            hits = sorted(glob.glob(str(ASSETS / folder / "**" / pat), recursive=True))
            hits = [h for h in hits if not h.endswith(".part") and os.path.getsize(h) > 2000 and time.time() - os.path.getmtime(h) > 15]
            if pat.endswith(".mp4"):
                hits = [h for h in hits if subprocess.run(["ffprobe", "-v", "error", h], capture_output=True).returncode == 0]
            if hits:
                return Path(hits[0])
    return None


def gameplay_clip():
    return find_asset("*parkour*.mp4", "*minecraft*.mp4", "*.mp4", folders=("gameplay",)) or find_asset("gp_*.mp4", folders=("raw",))


def font(name, size):
    files = {"anton": "Anton-Regular.ttf", "semibold": "TikTokSans36pt-SemiBold.ttf", "medium": "TikTokSans36pt-Medium.ttf", "black": "TikTokSans36pt-Black.ttf", "extrabold": "TikTokSans36pt-ExtraBold.ttf"}
    asset_font = find_asset("*" + files[name], folders=("font",))
    return ImageFont.truetype(str(asset_font or FONTS / files[name]), size)


MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
SYMBOL = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


# ---------- speech ----------

def tts(text, voice_id, speed, out: Path, key):
    receipt = out.with_suffix(".json")
    if out.exists() and out.stat().st_size > 2000 and receipt.exists() and json.loads(receipt.read_text()).get("text") == text:
        return False
    body = {"text": text, "reference_id": voice_id, "format": "mp3", "sample_rate": 44100, "mp3_bitrate": 192, "prosody": {"speed": speed, "volume": 0}, "latency": "normal"}
    for attempt in range(3):
        req = urllib.request.Request(
            "https://api.fish.audio/v1/tts",
            data=json.dumps(body).encode(),
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json", "model": "s2.1-pro-free"},
            method="POST",
        )
        started = time.time()
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                audio = r.read()
                status = r.status
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 2:
                time.sleep(6 * (attempt + 1))
                continue
            raise RuntimeError("fish " + str(e.code) + ": " + e.read()[:200].decode(errors="ignore"))
        if not audio:
            raise RuntimeError("fish returned empty audio")
        tmp = out.with_suffix(".part")
        tmp.write_bytes(audio)
        tmp.rename(out)
        out.with_suffix(".json").write_text(json.dumps({"engine": "s2.1-pro-free", "reference_id": voice_id, "text": text, "speed": speed, "status": status, "bytes": len(audio), "seconds": round(time.time() - started, 2), "at": time.time()}, indent=1))
        return True


def to_wav(src, dst, trim=True):
    af = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse" if trim else "anull"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", af, "-ar", str(SR), "-ac", "1", "-sample_fmt", "s16", str(dst)])


def read_wav(path):
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def write_wav(path, data):
    data = np.clip(data, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((data * 32767).astype(np.int16).tobytes())


_whisper = None


def whisper_words(path, prompt):
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        _whisper = WhisperModel("base.en", device="cpu", compute_type="int8")
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ar", "16000", "-ac", "1", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    segments, _ = _whisper.transcribe(np.frombuffer(pcm, dtype=np.float32), language="en", word_timestamps=True, initial_prompt=prompt, vad_filter=False)
    return [(w.word.strip(), w.start, w.end) for s in segments for w in s.words]


norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())


def align(words, timed, start, end):
    """Give every display word a (start, end) using timed reference words; fill gaps by character length."""
    if not words:
        return []
    a = [norm(w) for w in words]
    b = [norm(t[0]) for t in timed]
    times = [None] * len(words)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                times[i1 + k] = (timed[j1 + k][1], timed[j1 + k][2])
        elif tag == "replace":
            s, e = timed[j1][1], timed[j2 - 1][2]
            total = sum(len(w) + 1 for w in words[i1:i2])
            at = s
            for k in range(i1, i2):
                d = (e - s) * (len(words[k]) + 1) / total
                times[k] = (at, at + d)
                at += d
    k = 0
    while k < len(words):
        if times[k] is not None:
            k += 1
            continue
        j = k
        while j < len(words) and times[j] is None:
            j += 1
        s = times[k - 1][1] if k > 0 else start
        e = times[j][0] if j < len(words) else end
        if e <= s:
            e = s + 0.12 * (j - k)
        total = sum(len(w) + 1 for w in words[k:j])
        at = s
        for i in range(k, j):
            d = (e - s) * (len(words[i]) + 1) / total
            times[i] = (at, at + d)
            at += d
        k = j
    return [{"w": w, "s": t[0], "e": t[1]} for w, t in zip(words, times)]


def voice_track(job, script, style, key, mode):
    """Synthesise every turn, lay them out on the timeline, return turns with word timings and the voice wav."""
    turns = []
    at = 0.25
    beat = 60 / 101 / 2
    chunks = []
    for i, turn in enumerate(script["turns"]):
        voice_id, speed = VOICES.get(turn["speaker"], VOICES["narrator"])
        mp3 = job / ("turn-%02d.mp3" % i)
        fresh = tts(turn["text"], voice_id, speed, mp3, key)
        if fresh:
            log("  tts", i, turn["speaker"], len(turn["text"]), "chars")
        wav = job / ("turn-%02d.wav" % i)
        if not wav.exists() or fresh:
            to_wav(mp3, wav)
        data = read_wav(wav)
        dur = len(data) / SR
        if mode == "rap":
            at = math.ceil(at / beat - 1e-6) * beat
        cache = job / ("turn-%02d.words.json" % i)
        if cache.exists() and not fresh:
            timed = json.loads(cache.read_text())
        else:
            timed = whisper_words(wav, turn["text"])
            cache.write_text(json.dumps(timed))
        spoken = turn["text"].split()
        ref = align(spoken, timed, 0, dur)
        shown = align(turn["caption"].split(), [(x["w"], x["s"], x["e"]) for x in ref], 0, dur)
        words = [{"w": x["w"], "s": x["s"] + at, "e": x["e"] + at} for x in shown]
        turns.append({**turn, "index": i, "start": at, "end": at + dur, "words": words})
        chunks.append((at, data))
        at += dur + (0.04 if mode == "rap" else 0.14)
    total = at + 0.6
    track = np.zeros(int(total * SR) + SR, dtype=np.float32)
    for start, data in chunks:
        s = int(start * SR)
        track[s : s + len(data)] += data
    write_wav(job / "voice.wav", track[: int(total * SR)])
    return turns, total


# ---------- drawing ----------

def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return (int(r * 255), int(g * 255), int(b * 255), 255)


def rounded(img, box, r, fill, shadow=0):
    if shadow:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle((box[0], box[1] + shadow // 2, box[2], box[3] + shadow // 2), r, fill=(0, 0, 0, 110))
        img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(shadow)))
    ImageDraw.Draw(img).rounded_rectangle(box, r, fill=fill)


def wrap(draw, text, f, max_w, stroke=0):
    lines, line = [], ""
    for word in text.split():
        test = (line + " " + word).strip()
        if draw.textlength(test, font=f) + stroke * 2 <= max_w or not line:
            line = test
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def initials(name):
    return "".join(p[0] for p in name.split()[:2]).upper()


def avatar(item, size):
    url = item.get("photoUrl")
    if url:
        try:
            raw = urllib.request.urlopen(url, timeout=20).read()
            p = WORK / "cache" / (hashlib.md5(url.encode()).hexdigest() + ".img")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(raw)
            im = Image.open(p).convert("RGBA")
            side = min(im.size)
            im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2)).resize((size, size))
            mask = Image.new("L", (size, size), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
            im.putalpha(mask)
            return im
        except Exception:
            pass
    hue = item.get("hue", 250)
    a, b = hsl(hue, 0.75, 0.86), hsl((hue + 30) % 360, 0.7, 0.74)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = Image.new("RGBA", (size, size))
    for y in range(size):
        t = y / size
        ImageDraw.Draw(grad).line((0, y, size, y), fill=tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    im.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(im)
    f = font("extrabold", int(size * 0.38))
    d.text((size / 2, size / 2), initials(item["name"]), font=f, fill=(27, 26, 34, 190), anchor="mm")
    return im


def person_card(item, width=880):
    """The supporting picture: a clean contact update card."""
    pad = 44
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    fname, fbody, fsrc = font("black", 58), font("medium", 44), ImageFont.truetype(MONO, 26)
    body = wrap(probe, item["text"], fbody, width - pad * 2)
    h = pad + 150 + 30 + len(body) * 56 + 26 + 40 + pad
    img = Image.new("RGBA", (width + 60, h + 60), (0, 0, 0, 0))
    rounded(img, (30, 20, 30 + width, 20 + h), 44, (255, 255, 255, 250), shadow=18)
    img.alpha_composite(avatar(item, 150), (30 + pad, 20 + pad))
    d = ImageDraw.Draw(img)
    first, *rest = item["name"].split(" ")
    d.text((30 + pad + 150 + 30, 20 + pad + 22), first, font=fname, fill=(27, 26, 34, 255))
    if rest:
        d.text((30 + pad + 150 + 30, 20 + pad + 86), " ".join(rest), font=font("semibold", 38), fill=(27, 26, 34, 150))
    y = 20 + pad + 150 + 30
    for line in body:
        d.text((30 + pad, y), line, font=fbody, fill=(27, 26, 34, 235))
        y += 56
    src = ("COMING UP" if item.get("upcoming") else item.get("source", "")).upper()
    d.text((30 + pad, y + 22), src, font=fsrc, fill=(27, 26, 34, 120))
    return img


def reddit_card(title, width=940):
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    ft = font("black", 54)
    lines = wrap(probe, title, ft, width - 90)
    h = 40 + 80 + 24 + len(lines) * 66 + 30 + 40 + 36
    img = Image.new("RGBA", (width + 60, h + 60), (0, 0, 0, 0))
    rounded(img, (30, 20, 30 + width, 20 + h), 36, (255, 255, 255, 255), shadow=16)
    d = ImageDraw.Draw(img)
    d.ellipse((75, 60, 155, 140), fill=(255, 69, 0, 255))
    d.text((115, 100), "r/", font=font("black", 36), fill=WHITE, anchor="mm")
    d.text((175, 66), "r/mypeople", font=font("extrabold", 34), fill=(26, 26, 27, 255))
    d.text((175, 106), "u/me · just now", font=font("medium", 28), fill=(120, 124, 126, 255))
    y = 164
    for line in lines:
        d.text((75, y), line, font=ft, fill=(26, 26, 27, 255))
        y += 66
    d.text((75, y + 24), "▲ 4.2k     312 comments     share", font=ImageFont.truetype(SYMBOL, 28), fill=(120, 124, 126, 255))
    return img


def outlined(d, xy, text, f, fill, stroke, anchor="la"):
    d.text(xy, text, font=f, fill=fill, stroke_width=stroke, stroke_fill=BLACK, anchor=anchor)


def phrases(words, max_words=4):
    out = []
    for i, w in enumerate(words):
        last = out[-1] if out else None
        gap = last and w["s"] - last["words"][-1]["e"] > 0.6
        if not last or len(last["words"]) >= max_words or re.search(r"[.,!?;:]$", last["words"][-1]["w"]) or gap:
            out.append({"words": [w], "first": i})
        else:
            last["words"].append(w)
    return out


def highlight_caption(img, phrase, active, cy, ink=YELLOW, size=86, max_w=900):
    d = ImageDraw.Draw(img)
    f = font("anton", size)
    px, py, stroke, space = 12, 6, 5, 2
    sizes = [d.textbbox((0, 0), w["w"], font=f, stroke_width=stroke) for w in phrase]
    widths = [b[2] - b[0] + px * 2 for b in sizes]
    lines, line, lw = [], [], 0
    for i, wd in enumerate(widths):
        if line and lw + wd + space > max_w:
            lines.append(line)
            line, lw = [], 0
        line.append(i)
        lw += wd + space
    lines.append(line)
    lh = size * 1.25
    y0 = cy - lh * len(lines) / 2
    for li, ln in enumerate(lines):
        total = sum(widths[i] for i in ln) + space * (len(ln) - 1)
        x = (W - total) / 2
        y = y0 + li * lh
        for i in ln:
            word = phrase[i]["w"]
            if i == active:
                d.rounded_rectangle((x, y - py, x + widths[i], y + lh - py * 2), 12, fill=WHITE)
                d.text((x + px, y + lh / 2 - py), word, font=f, fill=BLACK, anchor="lm")
            else:
                outlined(d, (x + px, y + lh / 2 - py), word, f, ink, stroke, anchor="lm")
            x += widths[i] + space


def text_block(img, lines, cy, f, fill=WHITE, stroke=4, line_h=None, max_w=900, align_top=False):
    d = ImageDraw.Draw(img)
    out = []
    for line in lines:
        out += wrap(d, line, f, max_w, stroke) if line.strip() else [""]
    lh = line_h or f.size * 1.08
    y = cy if align_top else cy - lh * len(out) / 2
    for line in out:
        if line:
            d.text((W / 2, y), line, font=f, fill=fill, stroke_width=stroke, stroke_fill=BLACK, anchor="ma")
        y += lh
    return y


def sheared_text(text, f, fill, stroke, max_w=900, shear=0.2):
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    lines = wrap(probe, text, f, max_w, stroke)
    lh = int(f.size * 1.15)
    img = Image.new("RGBA", (W, lh * len(lines) + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        d.text((W / 2, 20 + i * lh), line, font=f, fill=fill, stroke_width=stroke, stroke_fill=BLACK, anchor="ma")
    return img.transform(img.size, Image.AFFINE, (1, shear, -shear * img.height / 2, 0, 1, 0), resample=Image.BICUBIC)


_cutouts = {}


def cutout(cast_id, width, mirror):
    key = (cast_id, width, mirror)
    if key not in _cutouts:
        path = find_asset(POSES.get(cast_id, cast_id) + "*.png", cast_id + "*.png", folders=("characters",))
        if not path:
            _cutouts[key] = None
        else:
            im = Image.open(path).convert("RGBA")
            bbox = im.getbbox()
            if bbox:
                im = im.crop(bbox)
            im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
            if mirror:
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            _cutouts[key] = im
    return _cutouts[key]


# ---------- timeline composition ----------

class Overlay:
    """Collects element state functions, renders one RGBA frame per state change, and writes an ffconcat list."""

    def __init__(self, job, duration):
        self.job = job
        self.duration = duration
        self.cuts = {0.0, duration}
        self.layers = []

    def add(self, cuts, draw):
        self.cuts.update(c for c in cuts if 0 <= c <= self.duration)
        self.layers.append(draw)

    def build(self):
        frames = self.job / "frames"
        frames.mkdir(exist_ok=True)
        for old in frames.glob("*.png"):
            old.unlink()
        cuts = sorted(round(c * FPS) / FPS for c in self.cuts)
        cuts = [c for i, c in enumerate(cuts) if i == 0 or c > cuts[i - 1]]
        lines = ["ffconcat version 1.0"]
        last = None
        cache = {}
        for i in range(len(cuts) - 1):
            t0, t1 = cuts[i], cuts[i + 1]
            mid = (t0 + t1) / 2
            states = tuple(json.dumps(layer(None, mid), sort_keys=True, default=str) for layer in self.layers)
            if states not in cache:
                img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                for layer in self.layers:
                    layer(img, mid)
                path = frames / ("f%04d.png" % len(cache))
                img.save(path, compress_level=1)
                cache[states] = path
            last = cache[states]
            lines += ["file '%s'" % last, "duration %.4f" % (t1 - t0)]
        lines.append("file '%s'" % last)
        (self.job / "overlay.ffconcat").write_text("\n".join(lines) + "\n")
        return self.job / "overlay.ffconcat", len(cache)


def turn_at(turns, t):
    cur = None
    for turn in turns:
        if turn["start"] <= t:
            cur = turn
    return cur


def caption_cuts(turns):
    cuts = []
    for turn in turns:
        cuts += [turn["start"], turn["end"] + 0.3]
        for w in turn["words"]:
            cuts += [w["s"], w["e"]]
    return cuts


def caption_state(turns, t, max_words=4):
    turn = turn_at(turns, t)
    if not turn or t > turn["end"] + 0.3:
        return None
    groups = phrases(turn["words"], max_words)
    active = -1
    for i, w in enumerate(turn["words"]):
        if w["s"] <= t:
            active = i
    group = next((g for g in groups if g["first"] <= active < g["first"] + len(g["words"])), groups[0])
    local = active - group["first"]
    if active >= 0 and t > turn["words"][active]["e"] + 0.25:
        local = -1
    return turn, group, local


def picture_schedule(turns, items, duration):
    """Hold each contact's card from its first mention until the next contact; keep a picture on screen throughout."""
    by_name = {i["name"]: i for i in items}
    spans = []
    for turn in turns:
        item = by_name.get(turn.get("person") or "")
        if not item:
            continue
        if spans and spans[-1][2]["name"] == item["name"]:
            continue
        spans.append([turn["start"], None, item])
    if not spans and items:
        spans = [[0, None, items[0]]]
    for i, s in enumerate(spans):
        s[1] = spans[i + 1][0] if i + 1 < len(spans) else duration
    if spans:
        spans[0][0] = 0
    return spans


_cards = {}



# ---------- social post photos ----------

UA = {"User-Agent": "KinStories/1.0 (hackathon demo; contact: dev@kin.app)"}


def http_json(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def photo_query(item):
    key = os.environ.get("ANTHROPIC_API_KEY")
    fallback = re.sub(r"(until|on|in|at|for)\s+[A-Z][a-z]+\s+\d+.*$", "", item["text"]).strip(" .")
    if not key:
        return fallback
    prompt = "Write a 2 to 4 word Wikimedia Commons search query for the iconic photo this person would post on " + item["source"] + " for this update, like 'Lisbon tram Alfama' or 'half marathon finish line' or 'cacio e pepe'. Name the place or the activity, never a person. Update: " + item["text"] + " Reply with the query only."
    try:
        out = http_json("https://api.anthropic.com/v1/messages", json.dumps({"model": "claude-haiku-4-5", "max_tokens": 30, "messages": [{"role": "user", "content": prompt}]}).encode(), {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        return out["content"][0]["text"].strip().strip('"') or fallback
    except Exception as e:
        log("  photo query fallback", str(e)[:120])
        return fallback


def commons_photo(query):
    params = urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrsearch": "filetype:bitmap " + query, "gsrnamespace": 6, "gsrlimit": 20, "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime", "iiurlwidth": 1200})
    pages = http_json("https://commons.wikimedia.org/w/api.php?" + params).get("query", {}).get("pages", {})
    for page in sorted(pages.values(), key=lambda p: p.get("index", 99)):
        info = (page.get("imageinfo") or [{}])[0]
        w, h = info.get("width", 0), info.get("height", 0)
        if info.get("mime") != "image/jpeg" or w < 1000 or h < 700 or w > h * 1.9:
            continue
        meta = info.get("extmetadata", {})
        artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "unknown")).strip()
        lic = meta.get("LicenseShortName", {}).get("value", "")
        return info.get("thumburl") or info["url"], (artist + ", " + lic + ", Wikimedia Commons").strip(", ")
    return None, None


def ensure_photos(story, upload):
    """One photo per Instagram/Strava update, cached in Convex storage by update id."""
    for item in story["items"]:
        if item.get("source") not in ("Instagram", "Strava") or not item.get("updateId") or item.get("postPhotoUrl"):
            continue
        local = WORK / "cache" / ("post-" + item["updateId"] + ".jpg")
        if local.exists() and not upload:
            item["postPhotoPath"] = str(local)
            continue
        query = photo_query(item)
        url, credit = commons_photo(query + " hastemplate:Quality_image")
        if not url:
            url, credit = commons_photo(query)
        if not url:
            url, credit = commons_photo(" ".join(query.split()[:2]))
        if not url:
            log("  no photo for", item["name"], query)
            continue
        raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        local = WORK / "cache" / ("post-" + item["updateId"] + ".jpg")
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(raw)
        item["postPhotoPath"] = str(local)
        log("  photo", item["name"], repr(query), credit[:80])
        if upload:
            storage_id = upload(raw, "image/jpeg")
            convex("stories:setUpdatePhoto", {"updateId": item["updateId"], "storageId": storage_id, "prompt": "commons: " + query, "credit": credit})


def post_photo(item, size):
    path = item.get("postPhotoPath")
    if not path and item.get("postPhotoUrl"):
        path = str(WORK / "cache" / ("post-" + (item.get("updateId") or initials(item["name"])) + ".jpg"))
        if not os.path.exists(path):
            Path(path).write_bytes(urllib.request.urlopen(item["postPhotoUrl"], timeout=60).read())
        item["postPhotoPath"] = path
    if not path:
        return None
    im = Image.open(path).convert("RGBA")
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
    return im.resize((size, size), Image.LANCZOS)


def handle(item):
    return re.sub(r"[^a-z.]", "", item["name"].lower().replace(" ", "."))


def heart(d, x, y, s, fill=None, outline=(27, 26, 34, 255)):
    d.ellipse((x, y, x + s * 0.55, y + s * 0.55), fill=fill, outline=outline, width=4)
    d.ellipse((x + s * 0.45, y, x + s, y + s * 0.55), fill=fill, outline=outline, width=4)
    d.polygon([(x + s * 0.03, y + s * 0.38), (x + s * 0.97, y + s * 0.38), (x + s * 0.5, y + s * 0.95)], fill=fill or (255, 255, 255, 255), outline=None)
    d.line([(x + s * 0.03, y + s * 0.4), (x + s * 0.5, y + s * 0.95), (x + s * 0.97, y + s * 0.4)], fill=outline, width=4)


def instagram_card(item, width=900):
    pad = 28
    photo = post_photo(item, width)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    fcap = font("medium", 36)
    cap = wrap(probe, handle(item) + " " + item["text"], fcap, width - pad * 2)[:3]
    ph = width if photo else 0
    h = 120 + ph + 96 + 50 + len(cap) * 46 + pad
    img = Image.new("RGBA", (width + 60, h + 60), (0, 0, 0, 0))
    rounded(img, (30, 20, 30 + width, 20 + h), 30, (255, 255, 255, 255), shadow=18)
    d = ImageDraw.Draw(img)
    ring = Image.new("RGBA", (92, 92), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    for i, c in enumerate([(254, 218, 117), (250, 126, 30), (214, 41, 118), (150, 47, 191), (79, 91, 213)]):
        rd.pieslice((0, 0, 91, 91), i * 72 - 90, i * 72 - 18, fill=c + (255,))
    ring.alpha_composite(Image.new("RGBA", (84, 84), (255, 255, 255, 255)).resize((84, 84)), (4, 4))
    ImageDraw.Draw(ring).ellipse((4, 4, 87, 87), outline=(255, 255, 255, 255), width=4)
    ring.alpha_composite(avatar(item, 76), (8, 8))
    img.alpha_composite(ring, (30 + pad, 20 + 14))
    d.text((30 + pad + 110, 20 + 26), handle(item), font=font("extrabold", 34), fill=(27, 26, 34, 255))
    m = re.search(r"\b[Ii]n ([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)", item["text"])
    if m:
        d.text((30 + pad + 110, 20 + 66), m.group(1), font=font("medium", 28), fill=(27, 26, 34, 170))
    d.text((30 + width - pad - 40, 20 + 52), "•••", font=font("black", 30), fill=(27, 26, 34, 255), anchor="mm")
    y = 20 + 120
    if photo:
        mask = Image.new("L", photo.size, 255)
        img.paste(photo, (30, y), mask)
        y += ph
    heart(d, 30 + pad, y + 26, 48, fill=(255, 48, 64, 255), outline=(255, 48, 64, 255))
    d.ellipse((30 + pad + 78, y + 24, 30 + pad + 126, y + 72), outline=(27, 26, 34, 255), width=4)
    d.polygon([(30 + pad + 160, y + 30), (30 + pad + 206, y + 46), (30 + pad + 172, y + 74)], outline=(27, 26, 34, 255), width=4)
    d.text((30 + pad, y + 96), "%s likes" % "{:,}".format(800 + (item.get("hue", 7) * 13) % 1900), font=font("extrabold", 34), fill=(27, 26, 34, 255))
    y += 146
    for line in cap:
        d.text((30 + pad, y), line, font=fcap, fill=(27, 26, 34, 255))
        y += 46
    return img


def linkedin_card(item, width=900):
    pad = 40
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    m = re.search(r"as (.+?) at (.+?)\.?$", item["text"]) if item["kind"] == "job" else None
    role, company = (m.group(1), m.group(2)) if m else (item["text"].rstrip("."), "")
    fbig = font("black", 56)
    role_lines = wrap(probe, role, fbig, width - pad * 2)
    h = 150 + 120 + 70 + len(role_lines) * 66 + 60 + 90 + 80
    img = Image.new("RGBA", (width + 60, h + 60), (0, 0, 0, 0))
    rounded(img, (30, 20, 30 + width, 20 + h), 30, (255, 255, 255, 255), shadow=18)
    d = ImageDraw.Draw(img)
    top = Image.new("RGBA", (width, 150), (10, 102, 194, 255))
    mask = Image.new("L", (width, 150), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width, 190), 30, fill=255)
    img.paste(top, (30, 20), mask)
    d.rounded_rectangle((30 + width - pad - 66, 20 + 40, 30 + width - pad, 20 + 106), 10, fill=WHITE)
    d.text((30 + width - pad - 33, 20 + 73), "in", font=font("black", 46), fill=(10, 102, 194, 255), anchor="mm")
    av = avatar(item, 170)
    d.ellipse((30 + pad - 6, 20 + 74, 30 + pad + 176, 20 + 256), fill=WHITE)
    img.alpha_composite(av, (30 + pad, 20 + 80))
    y = 20 + 270
    d.text((30 + pad, y), item["name"], font=font("black", 50), fill=(0, 0, 0, 230))
    y += 70
    d.text((30 + pad, y), "Started a new position" if item["kind"] == "job" else ("Moved to a new city" if item["kind"] == "move" else "Shared an update"), font=font("semibold", 34), fill=(0, 0, 0, 150))
    y += 56
    for line in role_lines:
        d.text((30 + pad, y), line, font=fbig, fill=(0, 0, 0, 240))
        y += 66
    if company:
        d.text((30 + pad, y + 4), company, font=font("extrabold", 42), fill=(10, 102, 194, 255))
    y += 76
    d.rounded_rectangle((30 + pad, y, 30 + pad + 300, y + 70), 35, outline=(10, 102, 194, 255), width=4)
    d.text((30 + pad + 150, y + 35), "Congratulate", font=font("extrabold", 32), fill=(10, 102, 194, 255), anchor="mm")
    d.text((30 + width - pad, y + 35), "%d reactions" % (120 + item.get("hue", 3) * 3), font=font("medium", 30), fill=(0, 0, 0, 140), anchor="rm")
    return img


def x_card(item, width=900):
    pad = 40
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    ft = font("medium", 46)
    lines = wrap(probe, item["text"], ft, width - pad * 2)
    h = pad + 110 + 30 + len(lines) * 60 + 30 + 50 + 70 + pad
    img = Image.new("RGBA", (width + 60, h + 60), (0, 0, 0, 0))
    rounded(img, (30, 20, 30 + width, 20 + h), 30, (255, 255, 255, 255), shadow=18)
    d = ImageDraw.Draw(img)
    img.alpha_composite(avatar(item, 100), (30 + pad, 20 + pad))
    d.text((30 + pad + 124, 20 + pad + 10), item["name"], font=font("black", 40), fill=(15, 20, 25, 255))
    d.text((30 + pad + 124, 20 + pad + 58), "@" + handle(item).replace(".", ""), font=font("medium", 32), fill=(83, 100, 113, 255))
    d.text((30 + width - pad - 20, 20 + pad + 30), "X", font=font("black", 50), fill=(15, 20, 25, 255), anchor="mm")
    y = 20 + pad + 140
    for line in lines:
        d.text((30 + pad, y), line, font=ft, fill=(15, 20, 25, 255))
        y += 60
    d.text((30 + pad, y + 24), "Today", font=font("medium", 30), fill=(83, 100, 113, 255))
    d.line((30 + pad, y + 84, 30 + width - pad, y + 84), fill=(230, 236, 240, 255), width=2)
    d.text((30 + pad, y + 104), "%d Reposts    %s Likes" % (12 + item.get("hue", 1) % 80, "{:,}".format(300 + item.get("hue", 1) * 7)), font=font("semibold", 32), fill=(15, 20, 25, 255))
    return img


def strava_card(item, width=900):
    pad = 36
    photo = post_photo(item, width)
    text = item["text"]
    dist = re.search(r"(\d+(?:\.\d+)?)\s*(km|mi|miles?|k)\b", text)
    clock = re.search(r"\b(\d{1,2}:\d{2}:\d{2}|\d{1,3}:\d{2})\b(?!\s*(?:/|per))", text)
    pace = re.search(r"(\d{1,2}:\d{2})\s*(?:/|per)\s*(km|mi)", text)
    h = 120 + 70 + (360 if photo else 0) + 380 + 150
    img = Image.new("RGBA", (width + 60, h + 60), (0, 0, 0, 0))
    rounded(img, (30, 20, 30 + width, 20 + h), 30, (255, 255, 255, 255), shadow=18)
    d = ImageDraw.Draw(img)
    img.alpha_composite(avatar(item, 84), (30 + pad, 20 + pad))
    d.text((30 + pad + 104, 20 + pad + 6), item["name"], font=font("black", 38), fill=(36, 36, 40, 255))
    d.text((30 + pad + 104, 20 + pad + 52), "Today · Strava", font=font("medium", 28), fill=(110, 110, 120, 255))
    d.text((30 + width - pad, 20 + pad + 40), "STRAVA", font=font("black", 36), fill=(252, 76, 2, 255), anchor="rm")
    y = 20 + 140
    title = re.sub(r"\s+", " ", item["text"]).strip()
    for line in wrap(d, title, font("black", 44), width - pad * 2)[:2]:
        d.text((30 + pad, y), line, font=font("black", 44), fill=(36, 36, 40, 255))
        y += 54
    y += 16
    stats = [(v, lbl) for v, lbl in ((dist and dist.group(1) + " " + dist.group(2), "Distance"), (clock and clock.group(1), "Time"), (pace and pace.group(1) + " /" + pace.group(2), "Pace")) if v]
    if stats:
        col = (width - pad * 2) / len(stats)
        for i, (val, lbl) in enumerate(stats):
            d.text((30 + pad + i * col, y), lbl, font=font("medium", 26), fill=(110, 110, 120, 255))
            d.text((30 + pad + i * col, y + 32), val, font=font("black", 46), fill=(36, 36, 40, 255))
        y += 110
    map_h = 360
    mp = Image.new("RGBA", (width, map_h), (232, 236, 228, 255))
    md = ImageDraw.Draw(mp)
    for gx in range(0, width, 90):
        md.line((gx, 0, gx + 60, map_h), fill=(255, 255, 255, 255), width=10)
    for gy in range(40, map_h, 110):
        md.line((0, gy, width, gy + 30), fill=(255, 255, 255, 255), width=8)
    rng = np.random.default_rng(item.get("hue", 5))
    pts, ang = [], 0.0
    x0, y0 = width * 0.2, map_h * 0.7
    for i in range(80):
        ang += rng.normal(0, 0.25)
        x0 = min(width - 40, max(40, x0 + 9 * math.cos(ang)))
        y0 = min(map_h - 30, max(30, y0 - 4 * math.sin(ang) - 1.2))
        pts.append((x0, y0))
    md.line(pts, fill=(252, 76, 2, 255), width=10, joint="curve")
    md.ellipse((pts[0][0] - 12, pts[0][1] - 12, pts[0][0] + 12, pts[0][1] + 12), fill=(30, 180, 80, 255), outline=WHITE, width=4)
    md.ellipse((pts[-1][0] - 12, pts[-1][1] - 12, pts[-1][0] + 12, pts[-1][1] + 12), fill=(220, 40, 40, 255), outline=WHITE, width=4)
    img.paste(mp, (30, y))
    y += map_h
    if photo:
        strip = photo.crop((0, (width - 360) // 2, width, (width + 360) // 2))
        img.paste(strip, (30, y))
        y += 360
    heart(d, 30 + pad, y + 30, 40, outline=(36, 36, 40, 255))
    d.text((30 + pad + 60, y + 34), "%d kudos" % (20 + item.get("hue", 2) % 60), font=font("semibold", 30), fill=(36, 36, 40, 255))
    return img


def contacts_card(item, width=880):
    """Birthdays and Kin events: an iOS-style calendar reminder card."""
    pad = 44
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    fbody = font("black", 54)
    birthday = item["kind"] == "birthday"
    text = (item["name"].split()[0] + "'s birthday") if birthday else item["text"].split(". Place:")[0].rstrip(".")
    lines = wrap(probe, text, fbody, width - pad * 2 - 190)
    when = item["text"].replace("Birthday ", "").rstrip(".") if birthday else ""
    place = re.search(r"Place: ([^.]+)", item["text"])
    sub = when[:1].upper() + when[1:] if birthday else ("Coming up" + (" · " + place.group(1) if place else ""))
    h = max(250, pad * 2 + 60 + len(lines) * 64 + 56)
    img = Image.new("RGBA", (width + 60, h + 60), (0, 0, 0, 0))
    rounded(img, (30, 20, 30 + width, 20 + h), 40, (255, 255, 255, 250), shadow=18)
    d = ImageDraw.Draw(img)
    d.text((30 + pad, 20 + pad), ("CALENDAR" if birthday else "INVITE"), font=ImageFont.truetype(MONO, 26), fill=(255, 59, 48, 255) if birthday else (88, 86, 214, 255))
    y = 20 + pad + 50
    for line in lines:
        d.text((30 + pad, y), line, font=fbody, fill=(27, 26, 34, 255))
        y += 64
    d.text((30 + pad, y + 6), sub, font=font("semibold", 38), fill=(27, 26, 34, 150))
    img.alpha_composite(avatar(item, 150), (30 + width - pad - 150, 20 + (h - 150) // 2))
    return img


def card_for(item):
    if item["name"] not in _cards:
        src = item.get("source", "")
        maker = {"Instagram": instagram_card, "LinkedIn": linkedin_card, "X": x_card, "Twitter": x_card, "Strava": strava_card}.get(src)
        if not maker:
            maker = contacts_card if item["kind"] in ("birthday", "event") else person_card
        _cards[item["name"]] = maker(item)
    return _cards[item["name"]]


# ---------- audio & encode ----------

def sfx_path(kind):
    found = find_asset("*" + kind + "*.wav", "*" + kind + "*.mp3", folders=("audio",))
    return found or (REPO / "assets" / "stories" / (kind + ".wav"))


def mix(job, duration, voice=None, events=(), music=None, music_gain=0.0, source_audio=None):
    track = np.zeros(int(duration * SR) + SR, dtype=np.float32)
    if voice:
        v = read_wav(voice)
        track[: len(v)] += v
    loaded = {}
    for t, kind, gain in events:
        if kind not in loaded:
            tmp = job / ("sfx-" + kind + ".wav")
            to_wav(sfx_path(kind), tmp, trim=False)
            loaded[kind] = read_wav(tmp)
        s = int(t * SR)
        clip = loaded[kind][: max(0, len(track) - s)] * gain
        track[s : s + len(clip)] += clip
    write_wav(job / "fx.wav", track[: int(duration * SR)])
    inputs = ["-i", str(job / "fx.wav")]
    filt = "[0:a]volume=1.0[a0]"
    labels = "[a0]"
    n = 1
    if music:
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        filt += ";[%d:a]aresample=%d,volume=%.3f[a%d]" % (n, SR, music_gain, n)
        labels += "[a%d]" % n
        n += 1
    if source_audio:
        inputs += ["-i", str(source_audio)]
        filt += ";[%d:a]aresample=%d,volume=1.0[a%d]" % (n, SR, n)
        labels += "[a%d]" % n
        n += 1
    filt += ";%samix=inputs=%d:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=%d" % (labels, n, SR)
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", filt, "-t", "%.3f" % duration, "-ac", "2", "-ar", str(SR), str(job / "mix.wav")])
    return job / "mix.wav"


def background_filter(kind):
    if kind == "cover":
        return "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,fps=%d,setsar=1" % (W, H, W, H, FPS)
    if kind == "cover-trim-bottom":
        return "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d:(iw-%d)/2:0,fps=%d,setsar=1" % (W, H + 160, W, H, W, FPS)
    if kind == "square":
        return "scale=%d:-2,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black,fps=%d,setsar=1" % (W, W, H, FPS)
    return kind


def encode(job, out, duration, background, overlay_list, audio, bg_mode="cover", bg_start=0.0, dim=0.0, color=None):
    still = background and str(background).lower().endswith((".jpg", ".jpeg", ".png"))
    if still:
        bg_in = ["-loop", "1", "-framerate", str(FPS), "-i", str(background)]
        vf = "scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,zoompan=z='1.0+0.0005*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=%dx%d:fps=%d,setsar=1" % (W, H, FPS)
    elif background:
        bg_in = ["-ss", "%.2f" % bg_start, "-stream_loop", "-1", "-i", str(background)]
        vf = background_filter(bg_mode)
    else:
        bg_in = ["-f", "lavfi", "-i", "color=c=%s:s=%dx%d:r=%d" % (color or "black", W, H, FPS)]
        vf = "fps=%d" % FPS
    if dim:
        vf += ",eq=brightness=-%.2f:contrast=1.08" % dim
    graph = "[0:v]%s[bg];[1:v]format=rgba,fps=%d[ov];[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]" % (vf, FPS)
    run([
        "ffmpeg", "-y", "-v", "error", *bg_in,
        "-f", "concat", "-safe", "0", "-i", str(overlay_list),
        "-i", str(audio),
        "-filter_complex", graph, "-map", "[v]", "-map", "2:a",
        "-t", "%.3f" % duration, "-r", str(FPS),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-movflags", "+faststart", str(out),
    ])
    run(["ffmpeg", "-v", "error", "-xerror", "-i", str(out), "-f", "null", "-"])


def stills(out):
    paths = []
    d = probe_duration(out)
    for name, t in (("start", 0.6), ("mid", d / 2), ("end", max(0, d - 0.8))):
        p = out.with_name(out.stem + "-" + name + ".png")
        run(["ffmpeg", "-y", "-v", "error", "-ss", "%.2f" % t, "-i", str(out), "-frames:v", "1", "-vf", "scale=540:-2", str(p)])
        paths.append(str(p))
    return paths


# ---------- styles ----------

def render_character_gameplay(job, reel, story, key):
    script = reel["script"]
    turns, duration = voice_track(job, script, "dialogue", key, "dialogue")
    pics = picture_schedule(turns, story["items"], duration)
    ov = Overlay(job, duration)

    def picture(img, t):
        span = next((s for s in pics if s[0] <= t < s[1]), None)
        if img is None:
            return span and span[2]["name"]
        if span:
            card = card_for(span[2])
            scale = min(1.0, 530 / card.height)
            c = card if scale == 1 else card.resize((int(card.width * scale), int(card.height * scale)), Image.LANCZOS)
            img.alpha_composite(c, ((W - c.width) // 2, 135 + (530 - c.height) // 2))

    ov.add([s[0] for s in pics], picture)

    def speaker(img, t):
        turn = turn_at(turns, t)
        if not turn:
            return None
        pop = min(1.0, (t - turn["start"]) / 0.12)
        scale = 0.88 + 0.12 * pop
        if img is None:
            return [turn["speaker"], round(scale, 2)]
        layout = CAST_LAYOUT.get(turn["speaker"])
        if not layout:
            return
        im = cutout(turn["speaker"], int(layout["width"] * scale), layout.get("mirror", False))
        if im is None:
            return
        x = 65 if layout["side"] == "left" else W - 155 - im.width + 90
        img.alpha_composite(im, (max(0, x), H - 220 - im.height + int(30 * (1 - scale))))

    pop_cuts = []
    for turn in turns:
        pop_cuts += [turn["start"], turn["start"] + 0.04, turn["start"] + 0.08, turn["start"] + 0.12]
    ov.add(pop_cuts, speaker)

    def captions(img, t):
        st = caption_state(turns, t)
        if img is None:
            return st and [st[0]["index"], st[1]["first"], st[2]]
        if st:
            highlight_caption(img, st[1]["words"], st[2], cy=810)

    ov.add(caption_cuts(turns), captions)
    listing, n = ov.build()
    events = [(s[0], "swish", 0.55) for s in pics[1:]]
    audio = mix(job, duration, voice=job / "voice.wav", events=events)
    out = job / "reel.mp4"
    encode(job, out, duration, gameplay_clip(), listing, audio, bg_start=1.0)
    return out, n


def render_reddit(job, reel, story, key):
    script = reel["script"]
    turns, duration = voice_track(job, script, "narration", key, "narration")
    card = reddit_card(script["title"])
    card_until = min(6.0, duration)
    pics = picture_schedule(turns, story["items"], duration)
    ov = Overlay(job, duration)

    def opener(img, t):
        if img is None:
            return t < card_until
        if t < card_until:
            img.alpha_composite(card, ((W - card.width) // 2, 260))

    ov.add([card_until], opener)

    def picture(img, t):
        span = next((s for s in pics if s[0] <= t < s[1]), None) if t >= card_until else None
        if img is None:
            return span and span[2]["name"]
        if span:
            c = card_for(span[2])
            if c.height > 760:
                c = c.resize((int(c.width * 760 / c.height), 760), Image.LANCZOS)
            img.alpha_composite(c, ((W - c.width) // 2, 240))

    ov.add([s[0] for s in pics] + [card_until], picture)
    names = {i["name"].split()[0].lower() for i in story["items"]}

    def captions(img, t):
        st = caption_state(turns, t, max_words=3)
        if img is None:
            return st and [st[0]["index"], st[1]["first"]]
        if not st:
            return
        d = ImageDraw.Draw(img)
        f = font("black", 76)
        words = st[1]["words"]
        widths = [d.textlength(w["w"], font=f) for w in words]
        total = sum(widths) + 22 * (len(words) - 1)
        x = (W - total) / 2
        cy = 1180 if t < card_until else 1160
        for w, wd in zip(words, widths):
            name = re.sub(r"[^a-z]", "", w["w"].lower())
            hit = name in names or (name.endswith("s") and name[:-1] in names)
            outlined(d, (x, cy), w["w"], f, YELLOW if hit else WHITE, 6, anchor="lm")
            x += wd + 22

    ov.add(caption_cuts(turns) + [card_until], captions)
    listing, n = ov.build()
    gp = gameplay_clip()
    audio = mix(job, duration, voice=job / "voice.wav")
    out = job / "reel.mp4"
    encode(job, out, duration, gp, listing, audio, bg_start=12.0)
    return out, n


def render_rap(job, reel, story, key):
    script = reel["script"]
    turns, duration = voice_track(job, script, "rap", key, "rap")
    duration = max(duration, 8)
    ov = Overlay(job, duration)
    f = font("black", 64)
    pics = picture_schedule(turns, story["items"], duration)

    def cast(img, t):
        turn = turn_at(turns, t)
        active = turn["speaker"] if turn else "rick"
        if img is None:
            return active
        for cid in ("rick", "morty"):
            layout = CAST_LAYOUT[cid]
            on = cid == active
            im = cutout(cid, int(layout["width"] * (1.0 if on else 0.8)), layout.get("mirror", False))
            if im is None:
                continue
            if not on:
                im = im.copy()
                im.putalpha(im.getchannel("A").point(lambda a: int(a * 0.55)))
            x = 30 if layout["side"] == "left" else W - im.width - 30
            img.alpha_composite(im, (x, H - 120 - im.height))

    ov.add([tn["start"] for tn in turns], cast)

    def picture(img, t):
        span = next((s for s in pics if s[0] <= t < s[1]), None)
        if img is None:
            return span and span[2]["name"]
        if span:
            c = card_for(span[2])
            k = min(0.8, 480 / c.height)
            c = c.resize((int(c.width * k), int(c.height * k)), Image.LANCZOS)
            img.alpha_composite(c, ((W - c.width) // 2, 170))

    ov.add([s[0] for s in pics], picture)

    def bar(img, t):
        turn = turn_at(turns, t)
        live = turn and t <= turn["end"] + 0.3
        if img is None:
            return live and turn["index"]
        if live:
            im = sheared_text(turn["caption"], f, WHITE, 5)
            img.alpha_composite(im, (0, 700))

    ov.add([tn["start"] for tn in turns] + [tn["end"] + 0.3 for tn in turns], bar)
    listing, n = ov.build()
    beat = find_asset("*beat*101*.wav", "*hip*hop*.mp3", "*beat*.mp3", "*beat*.wav", folders=("audio",)) or REPO / "assets" / "stories" / "beat101.wav"
    audio = mix(job, duration, voice=job / "voice.wav", music=beat, music_gain=0.45)
    bg = find_asset("neon-laser*.mp4", "*laser*.mp4", folders=("rave",)) or gameplay_clip()
    out = job / "reel.mp4"
    encode(job, out, duration, bg, listing, audio, dim=0.18)
    return out, n


def clip_info(path):
    out = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", str(path)]))
    return out["streams"][0]["width"], out["streams"][0]["height"], float(out["format"]["duration"])


def onsets(path, duration, min_gap=0.32):
    """Beat or vocal accents from the clip audio: peaks of the rising loudness envelope."""
    tmp = Path(str(path) + ".mono.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(path), "-t", "%.2f" % duration, "-vn", "-ar", str(SR), "-ac", "1", "-sample_fmt", "s16", str(tmp)])
    a = read_wav(tmp)
    tmp.unlink()
    hop = SR // 100
    env = np.array([np.sqrt(np.mean(a[i : i + hop] ** 2)) for i in range(0, len(a) - hop, hop)])
    rise = np.maximum(0, np.diff(env, prepend=env[:1]))
    thresh = np.convolve(rise, np.ones(50) / 50, mode="same") * 2.2 + 1e-4
    out, last = [], -9
    for i in range(1, len(rise) - 1):
        t = i / 100
        if rise[i] > thresh[i] and rise[i] >= rise[i - 1] and rise[i] >= rise[i + 1] and t - last >= min_gap:
            out.append(t)
            last = t
    return out


def meme_text(img, lines, top, size=52, line_h=None, fill=WHITE, stroke=3, max_w=900, name="semibold"):
    return text_block(img, lines, top, font(name, size), fill=fill, stroke=stroke, line_h=line_h or int(size * 1.2), max_w=max_w, align_top=True)


def clip_background(clip, mode):
    """ffmpeg filter that lays a clip onto the 1080x1920 frame."""
    w, h, _ = clip_info(clip)
    if mode == "white-square":
        return "scale=%d:-2,pad=%d:%d:0:%d:color=white,fps=%d,setsar=1" % (W, W, H, 560, FPS)
    if mode == "black-square" and abs(w - h) < 40:
        return "scale=%d:-2,pad=%d:%d:0:%d:color=black,fps=%d,setsar=1" % (W, W, H, 420, FPS)
    return background_filter("cover")


def has_audio(path):
    return bool(run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)]).strip())


def render_clip_meme(job, reel, story, clip, mode, max_seconds, draw_static, draw_timed=None, cut_times=(), music=None):
    _, _, clip_dur = clip_info(clip)
    duration = min(clip_dur, max_seconds)
    ov = Overlay(job, duration)
    ov.add([], lambda img, t: None if img is None else draw_static(img))
    if draw_timed:
        ov.add(list(cut_times), draw_timed)
    listing, n = ov.build()
    if has_audio(clip):
        audio = mix(job, duration, source_audio=clip)
    else:
        audio = mix(job, duration, music=music or find_asset("rave-techno*", "*.mp3", folders=("audio",)), music_gain=1.0)
    out = job / "reel.mp4"
    encode(job, out, duration, clip, listing, audio, bg_mode=clip_background(clip, mode))
    return out, n


def keyed_frames(clip, out_dir, t0, t1, width=760):
    """Chroma-keyed RGBA frames of a greenscreen clip between t0 and t1."""
    out_dir.mkdir(exist_ok=True)
    if not any(out_dir.glob("*.png")):
        run(["ffmpeg", "-y", "-v", "error", "-ss", "%.2f" % t0, "-to", "%.2f" % t1, "-i", str(clip), "-vf", "fps=%d,scale=%d:-2" % (FPS, width), str(out_dir / "raw%04d.png")])
        for p in sorted(out_dir.glob("raw*.png")):
            a = np.asarray(Image.open(p).convert("RGB")).astype(np.int16)
            r, g, b = a[..., 0], a[..., 1], a[..., 2]
            green = (g > 90) & (g > r + 40) & (g > b + 40)
            alpha = np.where(green, 0, 255).astype(np.uint8)
            spill = (g > np.maximum(r, b)) & ~green
            a[..., 1] = np.where(spill, np.maximum(r, b), g)
            im = Image.fromarray(np.dstack([a.clip(0, 255).astype(np.uint8), alpha]), "RGBA")
            im.putalpha(im.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1)))
            im.save(out_dir / p.name.replace("raw", "key"))
            p.unlink()
    return sorted(out_dir.glob("key*.png"))


def hook_window(audio, length):
    """Start time so the loudest jump in the track lands about 4 s into the reel."""
    tmp = Path(str(audio) + ".mono.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(audio), "-t", "90", "-vn", "-ar", "8000", "-ac", "1", "-sample_fmt", "s16", str(tmp)])
    with wave.open(str(tmp)) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    tmp.unlink()
    rms = np.array([np.sqrt(np.mean(a[i : i + 4000] ** 2)) for i in range(0, len(a) - 4000, 4000)])
    best, at = 0, 4.0
    for i in range(10, len(rms) - int(length * 2)):
        jump = rms[i : i + 4].mean() - rms[i - 4 : i].mean()
        if jump > best:
            best, at = jump, i / 2
    return max(0.0, at - 4.0)


def render_oiia(job, reel, story, key):
    cat_clip = find_asset("spinning-cat-small-alpha.webm", folders=("animals",))
    track = find_asset("oiia-fein-remix.m4a", "oiia-apt-remix.m4a", "*.m4a", folders=("oiia",))
    if not cat_clip or not track:
        raise RuntimeError("missing OIIA cat alpha WebM or remix audio in reel-assets")
    script = reel["script"]
    setup, drop = (script["overlay"] + ["", ""])[:2]
    still = job / "cat-front.png"
    run(["ffmpeg", "-y", "-v", "error", "-c:v", "libvpx-vp9", "-ss", "0.3", "-i", str(cat_clip), "-frames:v", "1", "-pix_fmt", "rgba", str(still)])
    cat_im = Image.open(still).convert("RGBA")
    cat_im = cat_im.crop(cat_im.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox())
    k = min(760 / cat_im.width, 860 / cat_im.height)
    cat_im = cat_im.resize((int(cat_im.width * k), int(cat_im.height * k)), Image.LANCZOS)
    back = Image.eval(cat_im.convert("RGB"), lambda v: int(v * 0.72)).convert("RGBA")
    back.putalpha(cat_im.getchannel("A"))
    back = back.transpose(Image.FLIP_LEFT_RIGHT)
    frames = []
    for i in range(12):
        ang = i / 12 * 2 * math.pi
        sx = max(0.08, abs(math.cos(ang)))
        src = cat_im if math.cos(ang) >= 0 else back
        squeezed = src.resize((max(2, int(src.width * sx)), src.height), Image.LANCZOS)
        canvas = Image.new("RGBA", cat_im.size, (0, 0, 0, 0))
        canvas.alpha_composite(squeezed, ((cat_im.width - squeezed.width) // 2, 0))
        frames.append(canvas)
    front = frames[0]
    spin = list(range(1, 12)) + [0]
    duration = 18.0
    start = hook_window(track, duration)
    cut = job / "track.wav"
    run(["ffmpeg", "-y", "-v", "error", "-ss", "%.2f" % start, "-t", "%.2f" % duration, "-i", str(track), "-ar", str(SR), "-ac", "2", str(cut)])
    drop_at = 4.0
    hits = [t for t in onsets(cut, duration, min_gap=0.42) if t >= drop_at - 0.05]
    syllables = [t["caption"] for t in script["turns"] if t["beat"] == "drop"] or [t["caption"] for t in script["turns"]] or ["u i i a i"]
    cues = [(t, syllables[i % len(syllables)]) for i, t in enumerate(hits)]
    lead = next((t["caption"] for t in script["turns"] if t["beat"] == "setup"), "")
    spin_len = min(len(spin), 12)
    spin_seq = [spin[int(i * len(spin) / spin_len)] for i in range(spin_len)]
    cat_cache = {}

    def cat_frame(t):
        last = None
        for at, _ in cues:
            if at <= t:
                last = at
        if last is None:
            return 0
        k = int((t - last) * FPS)
        return spin_seq[k] if k < len(spin_seq) else 0

    def cat(img, t):
        idx = cat_frame(t)
        if img is None:
            return idx
        if idx not in cat_cache:
            cat_cache[idx] = frames[idx]
        im = cat_cache[idx]
        img.alpha_composite(im, ((W - im.width) // 2, 1400 - im.height))

    def text(img, t):
        cue = None
        for at, word in cues:
            if at <= t < at + 0.9:
                cue = word
        if t < drop_at and lead:
            cue = lead if t > drop_at - 1.6 else None
        joke = setup if t < drop_at else drop
        if img is None:
            return [joke, cue]
        meme_text(img, [joke], 230, size=58, stroke=0, fill=BLACK)
        if cue:
            ImageDraw.Draw(img).text((W / 2, 1520), cue, font=font("extrabold", 84), fill=BLACK, anchor="mm")

    ov = Overlay(job, duration)
    cat_cuts = []
    for at, _ in cues:
        cat_cuts += [at + i / FPS for i in range(len(spin_seq) + 1)]
    ov.add(cat_cuts, cat)
    ov.add([drop_at, drop_at - 1.6] + [c[0] for c in cues] + [c[0] + 0.9 for c in cues], text)
    listing, n = ov.build()
    audio = mix(job, duration, source_audio=cut)
    out = job / "reel.mp4"
    encode(job, out, duration, None, listing, audio, color="white")
    return out, n



def render_dogs(job, reel, story, key):
    lines = [l for l in reel["script"]["overlay"] if l.strip()] or [t["caption"] for t in reel["script"]["turns"]]
    dancer = find_asset("man-dancing-to-phone.mp4", folders=("ugc",))
    dogs = [find_asset(n, folders=("animals",)) for n in ("dancing-dog-golden-b-greenscreen.mp4", "dancing-dog-sunglasses-greenscreen.mp4")]
    dogs = [d for d in dogs if d]
    if not dancer or not dogs:
        raise RuntimeError("missing dancer or dancing dog clips")
    duration = 12.0
    loops = []
    for i, clip in enumerate(dogs):
        paths = keyed_frames(clip, job / ("dog%d" % i), 0.0, 3.0, width=1080)
        boxes = [b for b in (Image.open(f).getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox() for f in paths) if b]
        box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        k = 640 / (box[3] - box[1])
        loops.append([Image.open(f).crop(box).resize((int((box[2] - box[0]) * k), 640), Image.LANCZOS) for f in paths])
    ov = Overlay(job, duration)

    def text(img, t):
        if img is None:
            return 1
        meme_text(img, lines, 290, size=56, line_h=72, stroke=4, max_w=900)

    def dancers(img, t):
        idx = [int(t * FPS) % len(l) for l in loops]
        if img is None:
            return idx
        for i, (l, k) in enumerate(zip(loops, idx)):
            im = l[k]
            x = 10 if i == 0 else W - im.width - 10
            img.alpha_composite(im, (max(-80, x), H - 40 - im.height))

    ov.add([], text)
    ov.add([i / FPS for i in range(int(duration * FPS))], dancers)
    listing, n = ov.build()
    audio = mix(job, duration, music=find_asset("rave-phonk-kawaii*", folders=("audio",)), music_gain=0.9)
    out = job / "reel.mp4"
    encode(job, out, duration, dancer, listing, audio, dim=0.04)
    return out, n


def render_rave(job, reel, story, key):
    clip = find_asset("club-crowd-dancing*.mp4", "*crowd*.mp4", "*rave*.mp4", folders=("rave",))
    if not clip:
        raise RuntimeError("missing rave clip in reel-assets/rave")
    hook = [l for l in reel["script"]["overlay"] if l.strip()]
    beats = [t["caption"] for t in reel["script"]["turns"]]
    _, _, clip_dur = clip_info(clip)
    duration = min(clip_dur, 16)
    step = duration / max(1, len(beats))

    def static(img):
        meme_text(img, hook, 200, size=52, line_h=62, stroke=3)

    def timed(img, t):
        i = min(len(beats) - 1, int(t / step)) if beats else -1
        if img is None:
            return i
        if i >= 0:
            meme_text(img, [beats[i]], 1560, size=60, line_h=72, stroke=4, name="extrabold")

    return render_clip_meme(job, reel, story, clip, "black-square", 16, static, timed, [i * step for i in range(len(beats))], music=find_asset("rave-techno*", folders=("audio",)))


def ask_query(instruction, fallback):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return fallback
    try:
        out = http_json("https://api.anthropic.com/v1/messages", json.dumps({"model": "claude-haiku-4-5", "max_tokens": 30, "messages": [{"role": "user", "content": instruction + " Reply with the 2 to 4 word Wikimedia Commons search query only."}]}).encode(), {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        return out["content"][0]["text"].strip().strip('"').strip("'") or fallback
    except Exception as e:
        log("  query fallback", str(e)[:120])
        return fallback


def commons_image(query):
    p = WORK / "cache" / ("bg-" + hashlib.md5(query.encode()).hexdigest()[:12] + ".jpg")
    if not p.exists():
        url, credit = commons_photo(query + " hastemplate:Quality_image")
        if not url:
            url, credit = commons_photo(query)
        if not url:
            return None
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
        p.with_suffix(".txt").write_text(query + "\n" + credit)
        log("  background", repr(query), credit[:80])
    return p


def cover(im, size):
    w, h = size
    k = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * k + 1), int(im.height * k + 1)), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2, (im.width - w) // 2 + w, (im.height - h) // 2 + h))


def overlay_lines(script):
    lines = list(script.get("overlay") or [])
    while lines and not lines[-1].strip():
        lines.pop()
    return lines or [t["caption"] for t in script["turns"]]


def soft_music(name):
    return find_asset(name, folders=("audio",)) or REPO / "assets" / "stories" / "pad.wav"


def render_text_post(job, reel, story, key, scene_hint, ink=WHITE, darken=0.12, footage=None):
    """Dodo / UGC / Freecode posts: one dense block of native TikTok text over an everyday background."""
    lines = overlay_lines(reel["script"])
    words = sum(len(l.split()) for l in lines)
    duration = max(8.0, min(14.0, words / 3.4 + 2.5))
    bg = find_asset(footage, folders=("ugc",)) if footage else None
    if not bg:
        query = ask_query("Background photo for a casual TikTok text post that opens with: '" + lines[0] + "'. " + scene_hint + " Show the everyday scene or object, no text, no famous people.", scene_hint)
        bg = commons_image(query) or commons_image(scene_hint)
    ov = Overlay(job, duration)

    def text(img, t):
        if img is None:
            return 1
        f = font("semibold", 55)
        d = ImageDraw.Draw(img)
        wrapped = []
        for line in lines:
            wrapped += wrap(d, line, f, 900, 4) if line.strip() else [""]
        y = 280
        for line in wrapped:
            if line:
                d.text((W / 2, y), line, font=f, fill=ink, stroke_width=4, stroke_fill=BLACK, anchor="ma")
            y += 58.3

    ov.add([], text)
    listing, n = ov.build()
    audio = mix(job, duration, music=soft_music("phonk-60s.mp3" if ink == WHITE else "*pad*"), music_gain=0.35)
    out = job / "reel.mp4"
    encode(job, out, duration, bg, listing, audio, dim=darken)
    return out, n


def render_dodo(job, reel, story, key):
    return render_text_post(job, reel, story, key, "bedroom lamp night interior", ink=(246, 236, 205, 255), darken=0.3, footage="woman-on-phone-vertical.mp4")


def render_ugc(job, reel, story, key):
    return render_text_post(job, reel, story, key, "bright home kitchen", darken=0.12, footage="woman-talking-to-camera-a.mp4")


def render_freecode(job, reel, story, key):
    return render_text_post(job, reel, story, key, "cat face closeup tabby", darken=0.16, footage="man-selfie-video.mp4")


def spin_loop(job, clip, width=860):
    frames = keyed_frames(clip, job / "spin", 0.5, 3.5, width=1080)
    boxes = [b for b in (Image.open(f).getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox() for f in frames) if b]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    k = width / (box[2] - box[0])
    return [Image.open(f).crop(box).resize((width, int((box[3] - box[1]) * k)), Image.LANCZOS) for f in frames]


def render_cow(job, reel, story, key):
    script = reel["script"]
    turns = script["turns"]
    bg = find_asset("disco-ball-floor*.mp4", folders=("rave",)) or find_asset("club-laser*.mp4", folders=("rave",))
    cow_path = WORK / "cache" / "cow-holstein.png"
    if not cow_path.exists():
        url = "https://upload.wikimedia.org/wikipedia/commons/1/1b/Dairy_Cow_%28NIH_BioArt_99_-_628670%29.png"
        cow_path.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
    cow = Image.open(cow_path).convert("RGBA")
    cow = cow.crop(cow.getbbox())
    cow = cow.resize((760, int(cow.height * 760 / cow.width)), Image.LANCZOS)
    duration = 11.0
    drop_i = next((i for i, t in enumerate(turns) if t["beat"] == "drop"), 1)
    setup_end = 3.6
    step = (duration - setup_end) / max(1, len(turns) - drop_i)
    times = [0.0] * drop_i + [setup_end + i * step for i in range(len(turns) - drop_i)]
    flip_len = 1.5
    rotations = {}

    def cow_state(t):
        if setup_end <= t < setup_end + flip_len:
            k = (t - setup_end) / flip_len
            return int(k * 3 * 360) % 360, int(-math.sin(k * math.pi) * 520)
        bob = int(abs(math.sin(t * 2 * math.pi * 1.25)) * -26)
        return 0, bob

    def draw_cow(img, t):
        ang, dy = cow_state(t)
        if img is None:
            return [ang // 6, dy // 8]
        if ang not in rotations:
            rotations[ang] = cow.rotate(ang, resample=Image.BICUBIC, expand=True)
        im = rotations[ang]
        img.alpha_composite(im, ((W - im.width) // 2, 1470 - im.height // 2 - cow.height // 2 + dy))

    ov = Overlay(job, duration)
    ov.add([i / FPS for i in range(int(duration * FPS))], draw_cow)

    def lines(img, t):
        i = max(k for k, s in enumerate(times) if s <= t)
        if img is None:
            return i
        meme_text(img, [turns[i]["caption"]], 260, size=66, line_h=80, stroke=5, name="extrabold")

    ov.add(times, lines)
    listing, n = ov.build()
    audio = mix(job, duration, music=find_asset("phonk-60s.mp3", folders=("audio",)), music_gain=0.9, events=[(setup_end, "swish", 0.8), (setup_end + flip_len, "boom", 0.6)])
    out = job / "reel.mp4"
    encode(job, out, duration, bg, listing, audio, bg_mode="cover-trim-bottom", dim=0.05)
    return out, n


def render_selfie(job, reel, story, key):
    script = reel["script"]
    turns, duration = voice_track(job, script, "monologue", key, "dialogue")
    clip = find_asset("*capybara*.mp4", folders=("animals",))
    bg = clip or commons_image("capybara swimming water") or commons_image("capybara")
    ov = Overlay(job, duration)

    def captions(img, t):
        st = caption_state(turns, t, max_words=4)
        if img is None:
            return st and [st[0]["index"], st[1]["first"], st[2]]
        if not st:
            return
        d = ImageDraw.Draw(img)
        f = font("semibold", 70)
        words = st[1]["words"]
        widths = [d.textlength(w["w"], font=f) for w in words]
        x = (W - sum(widths) - 20 * (len(words) - 1)) / 2
        for i, (w, wd) in enumerate(zip(words, widths)):
            outlined(d, (x, 1380), w["w"], f, YELLOW if i == st[2] else WHITE, 5, anchor="lm")
            x += wd + 20

    ov.add(caption_cuts(turns), captions)
    listing, n = ov.build()
    audio = mix(job, duration, voice=job / "voice.wav")
    out = job / "reel.mp4"
    encode(job, out, duration, bg, listing, audio)
    return out, n


def face_on(card, talk, blink=False):
    r = max(34, min(64, int(card.width * 0.07)))
    pad = r + 8
    im = Image.new("RGBA", (card.width, card.height + pad * 2), (0, 0, 0, 0))
    im.alpha_composite(card, (0, pad))
    d = ImageDraw.Draw(im)
    cx, cy = card.width // 2, pad + 14
    gap = int(r * 1.6)
    for ex in (cx - gap, cx + gap):
        d.ellipse((ex - r, cy - r, ex + r, cy + r), fill=WHITE, outline=BLACK, width=6)
        d.ellipse((ex - r // 2 + 6, cy - r // 2, ex + r // 2 + 6, cy + r // 2), fill=BLACK)
    mw, mh = int(r * 1.5), int(14 + talk * r * 1.3)
    my = card.height + pad - 10
    d.rounded_rectangle((cx - mw, my, cx + mw, my + mh), mh // 2, fill=(60, 10, 20, 255), outline=BLACK, width=6)
    return im


def render_ai_meme(job, reel, story, key):
    script = reel["script"]
    turns, duration = voice_track(job, script, "dialogue", key, "dialogue")
    by_name = {i["name"]: i for i in story["items"]}
    speakers = []
    for tn in turns:
        if tn["speaker"] not in speakers:
            speakers.append(tn["speaker"])
    objects = {}
    for sp in speakers:
        person = next((tn["person"] for tn in turns if tn["speaker"] == sp and tn.get("person") in by_name), None)
        item = by_name.get(person) or story["items"][len(objects) % len(story["items"])]
        card = card_for(item)
        k = min(700 / card.width, 520 / card.height)
        objects[sp] = (card.resize((int(card.width * k), int(card.height * k)), Image.LANCZOS), item)
    names = {c["id"]: c["name"] for c in script.get("characters", [])}
    bg = Image.new("RGBA", (W, H))
    top, bottom = hsl(270, 0.7, 0.9), hsl(330, 0.75, 0.88)
    for y in range(H):
        k = y / H
        ImageDraw.Draw(bg).line((0, y, W, y), fill=tuple(int(top[i] * (1 - k) + bottom[i] * k) for i in range(3)) + (255,))
    ov = Overlay(job, duration)

    def scene(img, t):
        turn = turn_at(turns, t)
        talk = round(talkiness(turn, t), 1) if turn else 0
        if img is None:
            return [turn and turn["speaker"], talk]
        img.alpha_composite(bg)
        for i, sp in enumerate(speakers[:2]):
            card, _ = objects[sp]
            on = turn and turn["speaker"] == sp
            im = face_on(card, talk if on else 0)
            if not on:
                im = im.resize((int(im.width * 0.88), int(im.height * 0.88)), Image.LANCZOS)
            x = 30 if i == 0 else W - im.width - 30
            y = 230 if i == 0 else 860
            img.alpha_composite(im, (x, y - (20 if on else 0)))

    cuts = []
    for tn in turns:
        cuts += [tn["start"]] + [w["s"] for w in tn["words"]] + [(w["s"] + w["e"]) / 2 for w in tn["words"]] + [w["e"] for w in tn["words"]]
    ov.add(cuts, scene)

    def subtitle(img, t):
        st = caption_state(turns, t, max_words=6)
        if img is None:
            return st and [st[0]["index"], st[1]["first"]]
        if not st:
            return
        d = ImageDraw.Draw(img)
        tag = names.get(st[0]["speaker"], st[0]["speaker"]).upper()
        d.text((W / 2, 1560), tag, font=font("black", 36), fill=(27, 26, 34, 200), anchor="mm")
        meme_text(img, [" ".join(w["w"] for w in st[1]["words"])], 1610, size=62, stroke=4, name="extrabold")

    ov.add(caption_cuts(turns), subtitle)
    listing, n = ov.build()
    audio = mix(job, duration, voice=job / "voice.wav", events=[(tn["start"], "pop", 0.35) for tn in turns])
    out = job / "reel.mp4"
    encode(job, out, duration, None, listing, audio, color="white")
    return out, n


def talkiness(turn, t):
    w = next((w for w in turn["words"] if w["s"] <= t <= w["e"]), None)
    if not w:
        return 0
    return 1.0 if (t - w["s"]) < (w["e"] - w["s"]) / 2 else 0.4


def serif(size, italic=False):
    return ImageFont.truetype(str(FONTS / ("InstrumentSerif-Italic.ttf" if italic else "InstrumentSerif-Regular.ttf")), size)


def render_slides(job, reel, story, key, kind):
    script = reel["script"]
    turns = script["turns"]
    per = {"launch": 3.2, "website": 2.6}.get(kind, 2.5)
    duration = per * len(turns) + 0.4
    by_name = {i["name"]: i for i in story["items"]}
    starts = [i * per for i in range(len(turns))]
    desk = commons_image("laptop on wooden desk") if kind == "website" else None
    photos = {}
    if kind == "carousel":
        for i, tn in enumerate(turns):
            item = by_name.get(tn.get("person") or "")
            p = item and post_photo(item, 1080)
            hint = {"birthday": "birthday cake candles", "event": "cocktail bar drinks", "job": "modern office desk laptop"}.get(item["kind"]) if item else None
            if p is None and hint:
                path = commons_image(hint)
                p = Image.open(path).convert("RGBA") if path else None
            if p is None:
                q = ask_query("Instagram carousel photo for the slide '" + tn["caption"] + "'. Show a place, object or scene, no famous people.", "city street golden hour")
                path = commons_image(q) or commons_image("city street golden hour")
                p = Image.open(path).convert("RGBA") if path else None
            photos[i] = cover(p, (W, H)) if p else None
    ov = Overlay(job, duration)

    def slide_index(t):
        return max(i for i, s in enumerate(starts) if s <= t)

    def draw(img, t):
        i = slide_index(t)
        tn = turns[i]
        item = by_name.get(tn.get("person") or "")
        local = t - starts[i]
        words = tn["caption"].split()
        shown = len(words) if kind != "launch" else min(len(words), 1 + int(local / 0.22))
        if img is None:
            return [i, shown]
        d = ImageDraw.Draw(img)
        if kind == "carousel":
            if photos.get(i) is not None:
                img.alpha_composite(photos[i])
            shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            for y in range(H // 2, H):
                ImageDraw.Draw(shade).line((0, y, W, y), fill=(0, 0, 0, int(200 * (y - H / 2) / (H / 2))))
            img.alpha_composite(shade)
            text_block(img, [tn["caption"]], 1330, font("extrabold", 78), stroke=0, line_h=90, align_top=True)
            for k in range(len(turns)):
                x = W / 2 + (k - (len(turns) - 1) / 2) * 30
                d.ellipse((x - 8, 1760 - 8, x + 8, 1760 + 8), fill=(255, 255, 255, 255 if k == i else 110))
        elif kind == "brand":
            img.alpha_composite(Image.new("RGBA", (W, H), (246, 242, 236, 255)))
            d.text((90, 150), "%d / %d" % (i + 1, len(turns)), font=ImageFont.truetype(MONO, 30), fill=(27, 26, 34, 120))
            y = text_block(img, [tn["caption"]], 300, serif(118), fill=(27, 26, 34, 255), stroke=0, line_h=124, max_w=900, align_top=True)
            if item:
                c = card_for(item)
                k = min(1.0, (1700 - y - 80) / c.height)
                c = c.resize((int(c.width * k), int(c.height * k)), Image.LANCZOS)
                img.alpha_composite(c, ((W - c.width) // 2, int(y + 80)))
            else:
                d.ellipse((W / 2 - 160, 1100, W / 2 + 160, 1420), fill=(49, 57, 251, 255))
        elif kind == "launch":
            img.alpha_composite(Image.new("RGBA", (W, H), (11, 11, 15, 255)))
            glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(glow).ellipse((W / 2 - 520, 1150, W / 2 + 520, 2100), fill=(255, 110, 30, 150))
            img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(160)))
            for gx in range(0, W, 90):
                d.line((gx, 0, gx, H), fill=(255, 255, 255, 18), width=2)
            for gy in range(0, H, 90):
                d.line((0, gy, W, gy), fill=(255, 255, 255, 18), width=2)
            text_block(img, [" ".join(words[:shown])], 360, serif(120), fill=WHITE, stroke=0, line_h=126, max_w=920, align_top=True)
            if item and shown == len(words):
                c = card_for(item)
                k = min(0.8, 640 / c.height)
                img.alpha_composite(c.resize((int(c.width * k), int(c.height * k)), Image.LANCZOS), ((W - int(c.width * k)) // 2, 1000))
        elif kind == "website":
            meme_text(img, [tn["caption"]], 300, size=64, line_h=76, stroke=5, name="extrabold")
            d.rounded_rectangle((90, 760, W - 90, 1420), 30, fill=(20, 20, 24, 255))
            d.rounded_rectangle((115, 785, W - 115, 1395), 16, fill=(239, 238, 252, 255))
            d.polygon([(40, 1430), (W - 40, 1430), (W - 120, 1480), (120, 1480)], fill=(200, 200, 206, 255))
            c = card_for(item) if item else reddit_card(script.get("title") or tn["caption"])
            k = min((W - 290) / c.width, 560 / c.height)
            c = c.resize((int(c.width * k), int(c.height * k)), Image.LANCZOS)
            img.alpha_composite(c, ((W - c.width) // 2, 785 + (610 - c.height) // 2))

    cuts = list(starts)
    if kind == "launch":
        for i, tn in enumerate(turns):
            cuts += [starts[i] + k * 0.22 for k in range(len(tn["caption"].split()) + 1)]
    ov.add(cuts, draw)
    listing, n = ov.build()
    music = {"website": soft_music("phonk-60s.mp3"), "launch": REPO / "assets" / "stories" / "pad.wav"}.get(kind, REPO / "assets" / "stories" / "pad.wav")
    audio = mix(job, duration, music=music, music_gain=0.5 if kind == "website" else 0.8, events=[(s, "swish", 0.5) for s in starts[1:]])
    out = job / "reel.mp4"
    encode(job, out, duration, desk, listing, audio, color="black", dim=0.2 if desk else 0.0)
    return out, n


RENDERERS = {
    "company-character-gameplay": render_character_gameplay,
    "company-gameplay-stories": render_reddit,
    "brainrot-rap-reels": render_rap,
    "spinning-animal-reels": render_oiia,
    "dancing-dogs-reel": render_dogs,
    "surreal-rave-reels": render_rave,
    "surreal-animal-action-reels": render_cow,
    "animal-selfie-reels": render_selfie,
    "company-ai-meme-videos": render_ai_meme,
    "company-ugc-dodo-style": render_dodo,
    "company-ugc-posts": render_ugc,
    "website-reel-remakes": lambda *a: render_slides(*a, "website"),
    "freecode-reel-workflow": render_freecode,
    "company-photo-carousel": lambda *a: render_slides(*a, "carousel"),
    "company-brand-posts": lambda *a: render_slides(*a, "brand"),
    "company-launch-videos": lambda *a: render_slides(*a, "launch"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", default="alex")
    ap.add_argument("--story")
    ap.add_argument("--styles")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-upload", action="store_true")
    args = ap.parse_args()
    key = env_file("fish.env")["FISH_API_KEY"]
    story_id = args.story
    if not story_id:
        days = convex("stories:list", {"userKey": args.user})
        story_id = next(d["storyId"] for d in days if d["label"] == "Today")
    story = convex("stories:get", {"storyId": story_id})

    def upload(data, mime):
        req = urllib.request.Request(convex("stories:videoUploadUrl", {}), data=data, headers={"Content-Type": mime}, method="POST")
        return json.loads(urllib.request.urlopen(req, timeout=300).read())["storageId"]

    ensure_photos(story, None if args.no_upload else upload)
    wanted = args.styles.split(",") if args.styles else ORDER
    reels = {r["style"]: r for r in story["reels"]}
    for style in [s for s in ORDER if s in wanted]:
        reel = reels.get(style)
        if not reel or not reel.get("script") or style not in RENDERERS:
            continue
        if reel.get("videoUrl") and not args.force:
            log(style, "already has video")
            continue
        job = WORK / "jobs" / story_id / style
        job.mkdir(parents=True, exist_ok=True)
        log("render", style)
        started = time.time()
        try:
            out, frames = RENDERERS[style](job, reel, story, key)
        except Exception as e:
            log("FAILED", style, str(e)[:2000])
            continue
        dur = probe_duration(out)
        shots = stills(out)
        log("  done %.1fs video, %d overlay frames, %.0fs wall" % (dur, frames, time.time() - started), out)
        log("  stills", " ".join(shots))
        if args.no_upload:
            continue
        storage_id = upload(out.read_bytes(), "video/mp4")
        convex("stories:setVideo", {"reelId": reel["_id"], "storageId": storage_id})
        log("  uploaded", storage_id)


if __name__ == "__main__":
    main()
