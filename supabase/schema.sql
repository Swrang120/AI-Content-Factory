-- AI Content Factory: Supabase foundation
-- Run this once in Supabase SQL Editor.

create table if not exists public.content_jobs (
  id text primary key,
  status text not null default 'researching',
  topic text not null,
  category text not null default '',
  language text not null default 'English',
  format text not null default 'Long Video',
  notes text not null default '',
  source_text text not null default '',
  sources jsonb not null default '[]'::jsonb,
  research text,
  script text,
  voice jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_jobs_status_idx on public.content_jobs(status);
create index if not exists content_jobs_updated_at_idx on public.content_jobs(updated_at desc);

alter table public.content_jobs enable row level security;

-- For production, the server should use SUPABASE_SERVICE_ROLE_KEY.
-- Do not put that key in GitHub or the browser.
