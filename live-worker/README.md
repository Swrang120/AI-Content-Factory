# AI Content Factory — YouTube Live Worker

This worker is the long-running FFmpeg side of the YouTube Live system.

## What it does

- Polls the existing AI Content Factory backend.
- Claims a scheduled live job beginning about 5 minutes before the event.
- Waits until the scheduled 2:00 PM IST start.
- Starts FFmpeg and sends the media package to the YouTube RTMP target.
- As soon as YouTube accepts the stream, transitions the broadcast to **live**.
- Stops FFmpeg at the scheduled 4:00 PM IST end.
- Transitions the YouTube broadcast to **complete**.
- Reports FFmpeg/start errors back to the backend.

The backend remains responsible for YouTube OAuth, broadcast/stream creation, scheduling and secure RTMP credentials. The worker token is required for worker endpoints.

## Environment

\`\`\`
ACF_API_URL=https://ai-content-factory-zeta-ruby.vercel.app
LIVE_WORKER_TOKEN=<same secret configured on Vercel>
FFMPEG_PATH=ffmpeg
LIVE_WORKER_POLL_MS=15000
\`\`\`

Do not put \`LIVE_WORKER_TOKEN\` into browser code, GitHub Pages, or the dashboard.

## Run

Node 22+:

\`\`\`
node live-worker/worker.js
\`\`\`

FFmpeg must be installed and available at \`FFMPEG_PATH\`.

The worker must be on an always-on machine. Vercel is used for orchestration, not as the two-hour FFmpeg process.

## Media behavior

- Monday: the backend selects the active owned/authorized Music Library master. The worker turns that audio into a simple 720p video stream.
- Other days: the backend selects the newest available rendered video from \`content_jobs\`.
- The worker loops the selected package until the scheduled 4:00 PM end.

## Safety / privacy

The dashboard never receives the raw YouTube RTMP stream key. Only an authenticated worker request receives the RTMP target.
