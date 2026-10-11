#!/usr/bin/env python3
"""Low-cost FFmpeg renderer for AI Content Factory GitHub Actions worker."""
from __future__ import annotations
import argparse, json, math, re, shutil, subprocess, sys, urllib.request
from pathlib import Path
from urllib.parse import urlparse

WORK = Path("render-work")
FPS = 30

def run(cmd: list[str]) -> None:
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run(cmd, check=True)

def download(url: str, dest: Path) -> Path:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"Only HTTPS asset URLs are accepted: {dest.name}")
    req = urllib.request.Request(url, headers={"User-Agent": "AI-Content-Factory-Renderer/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response, dest.open("wb") as f:
        shutil.copyfileobj(response, f)
    if not dest.exists() or dest.stat().st_size < 100:
        raise RuntimeError(f"Downloaded asset is empty: {dest.name}")
    return dest

def escape_ass(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", " ")

def ass_time(seconds: float) -> str:
    cs = max(0, round(seconds * 100))
    return f"{cs // 360000}:{(cs // 6000) % 60:02}:{(cs // 100) % 60:02}.{cs % 100:02}"

def make_ass(script: str, duration: float, width: int, height: int, path: Path) -> None:
    words = re.findall(r"\S+", re.sub(r"\s+", " ", script).strip()) or [" "]
    fontsize = 54 if width == 1080 else 42
    margin = 60 if width == 1080 else 90
    style = f"Style: Default,Arial,{fontsize},&H00FFFFFF,&H0000D7FF,&H80000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,{margin},{margin},100,1"
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
{style}
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    lines = [header]
    step = max(0.08, duration / len(words))
    for i, _ in enumerate(words):
        start, end = min(duration, i * step), min(duration, (i + 1) * step)
        context = []
        for j in range(max(0, i - 3), min(len(words), i + 4)):
            word = escape_ass(words[j])
            context.append(r"{\c&H00D7FF&\b1}" + word + r"{\rDefault}" if j == i else word)
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(max(start + .08, end))},Default,,0,0,0,,{' '.join(context)}\n")
    path.write_text("".join(lines), encoding="utf-8")

def probe_duration(audio: Path) -> float:
    raw = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(audio)], text=True).strip()
    duration = float(raw)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Could not determine narration duration")
    return duration

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="JSON payload file")
    parser.add_argument("--output", default="output/final-video.mp4")
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    script, audio_url = str(payload.get("script") or "").strip(), str(payload.get("audioUrl") or "").strip()
    image_urls = payload.get("imageUrls") or []
    if not script or not audio_url:
        raise ValueError("script and audioUrl are required")
    if not isinstance(image_urls, list) or not 2 <= len(image_urls) <= 12:
        raise ValueError("imageUrls must contain 2 to 12 HTTPS image URLs")
    fmt = str(payload.get("format") or "shorts").lower()
    width, height = (1920, 1080) if fmt in ("landscape", "youtube", "16:9") else (1080, 1920)
    WORK.mkdir(parents=True, exist_ok=True)
    Path("output").mkdir(parents=True, exist_ok=True)
    audio = download(audio_url, WORK / "voiceover.audio")
    duration = probe_duration(audio)
    scene_duration = duration / len(image_urls)
    clips = []
    for i, url in enumerate(image_urls):
        image = download(str(url), WORK / f"scene-{i:02}.img")
        clip = WORK / f"scene-{i:02}.mp4"
        frames = max(1, round(scene_duration * FPS))
        vf = (f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},"
              f"zoompan=z='min(zoom+0.0007,1.10)':x='iw/2-(iw/zoom/2)+sin(on/45)*8':"
              f"y='ih/2-(ih/zoom/2)':d={frames}:s={width}x{height}:fps={FPS},setsar=1,format=yuv420p")
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-loop", "1", "-i", str(image),
             "-t", f"{scene_duration:.4f}", "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "23", "-r", str(FPS), str(clip)])
        clips.append(clip)
    concat = WORK / "concat.txt"
    concat.write_text("".join(f"file '{p.resolve().as_posix()}'\n" for p in clips), encoding="utf-8")
    silent = WORK / "silent.mp4"
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-f", "concat", "-safe", "0",
         "-i", str(concat), "-c", "copy", str(silent)])
    ass = WORK / "captions.ass"
    make_ass(script, duration, width, height, ass)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    ass_filter = str(ass.resolve()).replace("\\", "/").replace(":", "\\:")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-i", str(silent), "-i", str(audio),
         "-vf", f"subtitles='{ass_filter}'", "-map", "0:v:0", "-map", "1:a:0", "-t", f"{duration:.3f}",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-r", str(FPS), str(output)])
    print(json.dumps({"ok": True, "output": str(output), "durationSeconds": round(duration, 2),
        "width": width, "height": height, "scenes": len(image_urls)}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"RENDER_ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
