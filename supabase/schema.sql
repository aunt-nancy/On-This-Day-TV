create extension if not exists pgcrypto;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  edition_date date not null,
  status text not null default 'queued' check (status in ('queued','running','complete','needs_human','failed')),
  trigger text not null default 'manual',
  agent_version text,
  years jsonb not null default '{}'::jsonb,
  publishable boolean not null default false,
  human_review_required boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_key text not null,
  status text not null default 'queued' check (status in ('queued','running','complete','failed','waiting_credentials')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0,
  discrepancy_count integer not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_jobs_run_idx on public.agent_jobs(run_id);

create table if not exists public.editions (
  id uuid primary key default gen_random_uuid(),
  edition_date date not null unique,
  run_id uuid references public.agent_runs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published','needs_human','archived')),
  lead_headline text not null default '',
  years jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  source_summary jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  era_key text,
  era_year integer,
  event_key text,
  role text,
  community text,
  title text not null,
  summary text,
  publication text,
  city text,
  issue_date date,
  page text,
  archive text,
  source_url text,
  language text,
  article_type text,
  confidence numeric(4,3) not null default 0,
  verification_notes text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists stories_edition_idx on public.stories(edition_id);

create table if not exists public.discrepancies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete cascade,
  edition_id uuid references public.editions(id) on delete cascade,
  discrepancy_type text not null,
  severity text not null check (severity in ('blocking','non_blocking')),
  description text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  human_resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists discrepancies_open_idx on public.discrepancies(status, severity);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  platform text not null,
  format text,
  status text not null default 'queued' check (status in ('queued','scheduled','sent_to_webhook','published','waiting_credentials','failed')),
  content jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  published_at timestamptz,
  external_id text,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.social_metrics (
  id uuid primary key default gen_random_uuid(),
  social_post_id uuid references public.social_posts(id) on delete cascade,
  platform text not null,
  metrics jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create table if not exists public.agent_settings (
  agent_key text primary key,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.agent_settings(agent_key, enabled)
values
('date_anniversary',true),('major_press',true),('black_press',true),('regional_local',true),
('community_press',true),('historical_context',true),('translation',true),
('source_verification',true),('rights_review',true),('visual_archive',true),
('discrepancy_exception',true),('editor_producer',true),('social_editor',true),
('short_form_video',true),('social_distribution',true),('engagement_trends',true)
on conflict (agent_key) do update set enabled = excluded.enabled, updated_at = now();

alter table public.agent_runs enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.editions enable row level security;
alter table public.stories enable row level security;
alter table public.discrepancies enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_metrics enable row level security;
alter table public.agent_settings enable row level security;

-- No anonymous policies are created. Server-side functions use the service-role key.
