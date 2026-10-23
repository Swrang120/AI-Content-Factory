#!/usr/bin/env python3
"""Free procedural cartoon-car loop + YouTube Live worker for AI Content Factory.

Required environment:
  ACF_BASE_URL       e.g. https://ai-content-factory-zeta-ruby.vercel.app
  LIVE_WORKER_TOKEN  same secret configured in Vercel
Optional:
  LIVE_MAX_MINUTES   default 120
"""
import json, math, os, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

BASE = os.environ.get("ACF_BASE_URL", "").rstrip("/")
TOKEN = os.environ.get("LIVE_WORKER_TOKEN", "")
MAX_MINUTES = max(1, min(360, int(os.environ.get("LIVE_MAX_MINUTES", "120"))))
WORK = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "acf-live"
WORK.mkdir(parents=True, exist_ok=True)

def request(method, route, payload=None, timeout=25):
    if not BASE or not TOKEN:
        raise RuntimeError("Missing ACF_BASE_URL or LIVE_WORKER_TOKEN GitHub Actions secret.")
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + route, data=data, method=method,
        headers={"X-Live-Worker-Token": TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:500]
        raise RuntimeError(f"API {route} returned HTTP {e.code}: {body}")

def render_loop():
    """Draw a small animated landscape using Pillow; encode it as a 10-second loop."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise RuntimeError("Pillow is missing. Install it with: pip install pillow")
    import random
    random.seed(17)
    width, height, fps, seconds = 1280, 720, 24, 10
    output = WORK / "cartoon-car-loop.mp4"
    raw = WORK / "frames.rgb"
    palette = {
        "sky": (113, 196, 245), "sun": (255, 222, 100),
        "far": (104, 174, 126), "near": (54, 133, 83),
        "road": (65, 68, 76), "edge": (236, 236, 220),
        "stripe": (255, 226, 130), "car": (224, 54, 49),
        "glass": (154, 223, 245), "wheel": (29, 31, 37)
    }
    with raw.open("wb") as fp:
        for n in range(fps * seconds):
            t = n / fps
            im = Image.new("RGB", (width, height), palette["sky"])
            d = ImageDraw.Draw(im)
            # Sun, drifting clouds, layered hills and roadside trees.
            d.ellipse((1000, 65, 1110, 175), fill=palette["sun"])
            for j, x0 in enumerate((120, 500, 850)):
                x = int((x0 - t * (18 + j * 3)) % (width + 180)) - 90
                y = 95 + j * 42
                d.ellipse((x, y, x+100, y+36), fill=(245, 250, 255))
                d.ellipse((x+24, y-20, x+82, y+35), fill=(245, 250, 255))
            d.polygon([(0,420),(180,255),(340,420),(520,235),(750,425),(950,275),(1280,430),(1280,540),(0,540)], fill=palette["far"])
            d.polygon([(0,470),(180,360),(360,470),(600,330),(820,475),(1060,350),(1280,465),(1280,570),(0,570)], fill=palette["near"])
            # Road perspective and shoulders.
            d.polygon([(440,430),(840,430),(1280,720),(0,720)], fill=palette["edge"])
            d.polygon([(460,438),(820,438),(1210,720),(70,720)], fill=palette["road"])
            # Moving centre lane markers; each marker repeats seamlessly.
            for k in range(-2, 8):
                y = int(445 + ((k * 95 + t * 135) % 460))
                if y < 720:
                    half = max(3, int((y-420) * .045))
                    cx = 640 + int((y-430) * .0)
                    d.polygon([(cx-half, y),(cx+half, y),(cx+half*2, y+22),(cx-half*2, y+22)], fill=palette["stripe"])
            # Roadside trees move in a continuous loop.
            for side in (-1, 1):
                for j in range(7):
                    y = int(390 + ((j*65 + t*70) % 340))
                    scale = max(.35, (y-350)/280)
                    x = int(640 + side*(230 + (y-390)*.72))
                    r = int(20*scale)
                    d.rectangle((x-int(4*scale), y, x+int(4*scale), y+int(22*scale)), fill=(106,75,45))
                    d.ellipse((x-r, y-int(2*r), x+r, y), fill=(34,119,66))
            # Car fixed near lower centre, wheels rotate visually with highlights.
            bob = int(math.sin(t * math.tau) * 2)
            cx, cy = 640, 555 + bob
            d.ellipse((cx-160,cy+42,cx+160,cy+70), fill=(43,48,48))
            d.rounded_rectangle((cx-150,cy-24,cx+150,cy+50), radius=22, fill=palette["car"], outline=(120,25,28), width=4)
            d.polygon([(cx-92,cy-25),(cx-48,cy-78),(cx+54,cy-78),(cx+112,cy-25)], fill=palette["car"])
            d.polygon([(cx-65,cy-32),(cx-36,cy-66),(cx+0,cy-66),(cx+0,cy-32)], fill=palette["glass"])
            d.polygon([(cx+12,cy-66),(cx+48,cy-66),(cx+87,cy-32),(cx+12,cy-32)], fill=palette["glass"])
            for wx in (cx-95, cx+95):
                d.ellipse((wx-35,cy+25,wx+35,cy+95), fill=palette["wheel"], outline=(210,210,210), width=5)
                angle = t * math.tau * 2
                d.line((wx,cy+60,wx+int(22*math.cos(angle)),cy+60+int(22*math.sin(angle))), fill=(230,230,230), width=5)
            d.rounded_rectangle((28,28,470,88), radius=18, fill=(17,39,55))
            d.text((52,46), "AI CONTENT FACTORY  •  CAR DRIVE", fill=(255,255,255), stroke_width=0)
            fp.write(im.tobytes())
    cmd = ["ffmpeg","-y","-f","rawvideo","-pixel_format","rgb24","-video_size",f"{width}x{height}",
           "-framerate",str(fps),"-i",str(raw),"-an","-c:v","libx264","-preset","ultrafast",
           "-pix_fmt","yuv420p","-r",str(fps),"-movflags","+faststart",str(output)]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    raw.unlink(missing_ok=True)
    return output

def main():
    claim = request("GET", "/api/live/worker/claim")
    job = claim.get("job")
    if not job:
        print("No live job ready for the worker; exiting without using runner time.")
        return
    job_id = job.get("id")
    rtmp_url = job.get("rtmpUrl")
    if not job_id or not rtmp_url:
        raise RuntimeError("The live API returned a job without an id or RTMP destination.")
    ffmpeg = None
    try:
        if job.get("mediaType") == "playlist" and isinstance(job.get("mediaPlaylist"), list) and job["mediaPlaylist"]:
            # Download selected videos and normalize them before concatenating for seamless looping.
            normalized = []
            for index, item in enumerate(job["mediaPlaylist"]):
                url = str(item.get("url") or "").strip()
                if not url:
                    continue
                raw = WORK / f"playlist-raw-{index:03d}"
                urllib.request.urlretrieve(url, raw)
                cooked = WORK / f"playlist-{index:03d}.mp4"
                subprocess.run(["ffmpeg", "-y", "-i", str(raw), "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", str(cooked)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                raw.unlink(missing_ok=True)
                normalized.append(cooked)
            if not normalized:
                raise RuntimeError("The selected playlist has no downloadable video files.")
            concat_file = WORK / "playlist.txt"
            concat_file.write_text("".join("file " + chr(39) + str(p) + chr(39) + "\n" for p in normalized), encoding="utf-8")
            source = WORK / "playlist-loop.mp4"
            subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), "-c", "copy", "-movflags", "+faststart", str(source)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        elif job.get("mediaType") == "video" and job.get("mediaUrl"):
            source = WORK / "source-video.mp4"
            urllib.request.urlretrieve(job["mediaUrl"], source)
        elif job.get("mediaType") == "audio" and job.get("mediaUrl"):
            source = WORK / "source-audio"
            urllib.request.urlretrieve(job["mediaUrl"], source)
        else:
            source = render_loop()
        # Signal the YouTube broadcast to go live only after the encoder has a valid source.
        request("POST", "/api/live/worker/start", {"id": job_id})
        if job.get("mediaType") == "audio":
            cmd = ["ffmpeg","-re","-stream_loop","-1","-f","lavfi","-i","color=c=darkslategray:s=1280x720:r=24",
                   "-re","-stream_loop","-1","-i",str(source),"-t",str(MAX_MINUTES*60),
                   "-c:v","libx264","-preset","ultrafast","-tune","zerolatency","-pix_fmt","yuv420p",
                   "-g","48","-b:v","1800k","-c:a","aac","-b:a","128k","-ar","44100","-shortest","-f","flv",rtmp_url]
        else:
            cmd = ["ffmpeg","-re","-stream_loop","-1","-i",str(source),"-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=44100",
                   "-t",str(MAX_MINUTES*60),"-c:v","libx264","-preset","ultrafast","-tune","zerolatency",
                   "-pix_fmt","yuv420p","-r","24","-g","48","-b:v","1800k","-maxrate","1800k","-bufsize","3600k",
                   "-c:a","aac","-b:a","128k","-ar","44100","-shortest","-f","flv",rtmp_url]
        ffmpeg = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        started = time.time()
        last_check = 0
        while ffmpeg.poll() is None and time.time() - started < MAX_MINUTES*60:
            time.sleep(10)
            if time.time() - last_check >= 20:
                last_check = time.time()
                state = request("GET", "/api/live/worker/status?id=" + job_id)
                if state.get("stopRequested") or state.get("status") == "stopping":
                    print("Stop requested from dashboard; terminating FFmpeg.")
                    ffmpeg.terminate()
                    try: ffmpeg.wait(timeout=15)
                    except subprocess.TimeoutExpired: ffmpeg.kill()
                    break
        if ffmpeg and ffmpeg.returncode not in (0, None):
            tail = ""
            try: tail = (ffmpeg.stderr.read() or "")[-1800:]
            except Exception: pass
            raise RuntimeError("FFmpeg exited with code " + str(ffmpeg.returncode) + ". " + tail)
        request("POST", "/api/live/worker/finish", {"id": job_id})
        print("Live worker finished cleanly.")
    except Exception as exc:
        if ffmpeg and ffmpeg.poll() is None:
            ffmpeg.terminate()
            try: ffmpeg.wait(timeout=10)
            except subprocess.TimeoutExpired: ffmpeg.kill()
        try: request("POST", "/api/live/worker/error", {"id": job_id, "error": str(exc)[:900]})
        except Exception as report_error: print("Could not report worker error:", report_error)
        raise

if __name__ == "__main__":
    try: main()
    except Exception as error:
        print("LIVE WORKER FAILED:", error, file=sys.stderr)
        sys.exit(1)
