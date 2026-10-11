# AI Content Factory

Private, single-owner content automation workspace for planning, researching, producing and eventually publishing videos across supported platforms.

## Current pipeline

```
Idea
  ↓
Research Job
  ↓
Make.com / research provider (optional)
  ↓
Research + Sources
  ↓
ChatGPT Script
  ↓
ElevenLabs Voice
  ↓
Video Production (existing Remotion path or optional FFmpeg Actions worker)
  ↓
QA / Approval
  ↓
YouTube Publisher
```

## Automatic Research → Script API

Start a job with:

`POST /api/pipeline/research`

Required:
- `topic`

Optional:
- `category`
- `language`
- `format`
- `notes`
- `sourceText`
- `sources`

If `MAKE_RESEARCH_WEBHOOK_URL` is configured, the job is sent to Make.com. Make should return the researched material and source list to:

`POST /api/pipeline/research/callback`

The callback then automatically sends the research to the script worker.

Check a job with:

`GET /api/pipeline/jobs/:id`

## FFmpeg + Python GitHub Actions renderer

The optional low-cost renderer is in `services/video_generator.py`, and its workflow is `.github/workflows/ffmpeg-render-worker.yml`. It installs FFmpeg on an ephemeral GitHub-hosted runner, downloads narration plus 2–12 HTTPS images, applies slow zoom/pan motion, burns approximate word-timed captions, and exports H.264/AAC MP4 in 9:16 or 16:9. This uses no paid AI video-generation model. Caption timings are estimated across the audio duration, not speech-recognition-aligned.

### Required GitHub Actions secrets

- `BLOB_READ_WRITE_TOKEN`: Vercel Blob read/write token for storing the finished MP4.
- `ACF_FACTORY_URL`: base URL of the currently active Vercel deployment, without a trailing slash.
- `APP_API_KEY`: optional; set this only if the Vercel server has `APP_API_KEY` configured, and use the same value.

### Run it manually

1. Open GitHub → Actions → **AI Content Factory - FFmpeg Render Worker** → **Run workflow**.
2. Supply the existing job ID, title, narration script, HTTPS audio URL, and a JSON array of 2–12 HTTPS image URLs, for example `["https://example.com/scene1.jpg","https://example.com/scene2.jpg"]`.
3. Choose `shorts` (1080×1920) or `landscape` (1920×1080).
4. On success, the MP4 is stored in Vercel Blob, a callback is sent to `/api/pipeline/jobs/:id/rendered`, and a 7-day workflow artifact is kept for inspection.

The workflow also supports `repository_dispatch` event type `acf-render-video` with a JSON `client_payload` containing `jobId`, `title`, `script`, `audioUrl`, `imageUrls`, and optional `format`, `description`, `tags`, `categoryId`, `privacyStatus`, `publishAt`, and `approved`.

**Important:** This worker is opt-in and does not replace or modify the existing Remotion/Vercel renderer or the existing scheduler. Triggering the workflow does not itself guarantee YouTube publication; the existing Factory settings, OAuth configuration, approval settings and API availability still control publishing. Review the job result before enabling unattended publishing.

## Security

Keep API keys, OAuth tokens, Make webhook URLs and private account data out of GitHub. Configure them as server/Vercel environment variables and GitHub Actions secrets.

Veryfi's Make app is a document OCR/data-extraction integration, not a general web-research engine, so it should only be added where document extraction is actually needed.

## Existing integrations

- ChatGPT/OpenAI content generation
- ElevenLabs voice generation
- YouTube OAuth/upload adapter
- Approval and Auto Publish controls
- AI Robot Control Room
- Optional FFmpeg + Python GitHub Actions renderer

## Roadmap

### Production
- [x] Job/state model foundation
- [x] Research → Script pipeline endpoint
- [x] Make.com research webhook bridge
- [x] ElevenLabs voice adapter
- [x] Optional FFmpeg rendering worker
- [ ] Persistent production database
- [ ] End-to-end background queue dispatch
- [ ] Thumbnail generation
- [ ] QA/copyright automation
- [ ] Scheduler hardening
- [ ] Analytics worker

<!-- VERCEL_REBUILD_TRIGGER: 2026-10-11 FFmpeg GitHub Actions renderer added -->
