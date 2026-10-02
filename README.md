# AI Content Factory

Private, single-owner content automation workspace for planning, producing and eventually publishing videos across supported platforms.

## Current phase — Foundation

This repository intentionally starts **without external API credentials**.

Included:
- Responsive private-style dashboard
- Dashboard overview and production pipeline
- Content queue
- Content creation modal
- Category management
- Scheduling area
- Platform connection placeholders
- Automation settings
- Local browser persistence with localStorage
- Mobile-friendly layout
- Clear separation for future API adapters

## Planned architecture

```
Dashboard
  ├── Content Planner
  ├── Category Engine
  ├── Research Worker
  ├── Script Worker
  ├── Voice Worker
  ├── Visual/Video Worker
  ├── QA & Rights Gate
  ├── Approval Gate
  ├── Scheduler
  └── Platform Publishers
        ├── YouTube
        ├── Facebook
        ├── Instagram
        └── Other supported platforms
```

## Content categories

Music Promotion, News & Updates, Product Promotion, Sports Information, Editing Knowledge, AI & Technology.

More categories can be added later.

## Important design rule

API credentials, OAuth tokens and private account data must **not** be committed to this repository. Future integrations should use server-side environment secrets or an appropriate secret manager.

Generated content should also keep source/licensing/provenance information so publishing decisions remain reviewable.

## Roadmap

### Phase 1 — Foundation
- [x] Dashboard shell
- [x] Content queue
- [x] Categories
- [x] Scheduling UI
- [x] Platform placeholders
- [x] Automation controls

### Phase 2 — Local production engine
- [ ] Job/state model
- [ ] Project folders and media manifest
- [ ] Render pipeline interface
- [ ] Caption/subtitle interface
- [ ] Thumbnail workflow
- [ ] QA checklist

### Phase 3 — AI adapters
- [ ] LLM provider
- [ ] Research/search provider
- [ ] TTS provider
- [ ] Image/video provider
- [ ] Speech-to-text provider

### Phase 4 — Publishing adapters
- [ ] YouTube OAuth/upload
- [ ] Meta publishing
- [ ] Other supported platforms

### Phase 5 — Automation
- [ ] Background jobs
- [ ] Daily/weekly schedules
- [ ] Retry/failure handling
- [ ] Analytics ingestion

## Running

The current foundation is static and can be opened directly or hosted with GitHub Pages/Vercel.

No API key is required for the current phase.
