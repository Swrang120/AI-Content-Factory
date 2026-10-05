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
Video Production
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

## Security

Keep API keys, OAuth tokens, Make webhook URLs and private account data out of GitHub. Configure them as server/Vercel environment variables.

Veryfi's Make app is a document OCR/data-extraction integration, not a general web-research engine, so it should only be added where document extraction is actually needed.

## Existing integrations

- ChatGPT/OpenAI content generation
- ElevenLabs voice generation
- YouTube OAuth/upload adapter
- Approval and Auto Publish controls
- AI Robot Control Room

## Roadmap

### Production
- [x] Job/state model foundation
- [x] Research → Script pipeline endpoint
- [x] Make.com research webhook bridge
- [x] ElevenLabs voice adapter
- [x] Persistent production database (Supabase-backed content jobs + production metadata)
- [x] Background worker/queue (durable worker state + GitHub Actions worker)
- [x] Video renderer (Remotion/Vercel Sandbox with transient retry)
- [x] Thumbnail generation (AI image generation + Vercel Blob)
- [x] QA/copyright automation (deterministic gate + AI originality/rights review)
- [x] Scheduler (Asia/Kolkata catch-up scheduler)
- [x] Analytics worker (persistent YouTube analytics snapshots)
