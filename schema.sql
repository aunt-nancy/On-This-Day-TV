-- ON THIS DAY TV — CONSOLIDATED AUTOMATIC NEWSROOM RC1
-- Run once in Supabase SQL editor before deployment.
create extension if not exists pgcrypto;

create table if not exists public.otd_runs(
  id uuid primary key default gen_random_uuid(),
  edition_date date not null,
  run_kind text not null default 'daily',
  status text not null default 'queued',
  stage text not null default 'opening',
  run_attempt integer not null default 1,
  next_retry_at timestamptz,
  years jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  locked_until timestamptz,
  lock_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(edition_date,run_kind)
);

create table if not exists public.otd_agent_jobs(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.otd_runs(id) on delete cascade,
  agent_key text not null,
  status text not null default 'running',
  attempt integer not null default 1,
  output jsonb,
  confidence numeric(5,4) not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists otd_agent_jobs_run_agent_idx on public.otd_agent_jobs(run_id,agent_key,attempt desc);

create table if not exists public.otd_editions(
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.otd_runs(id) on delete set null,
  edition_date date not null unique,
  status text not null default 'draft',
  lead_headline text,
  years jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.otd_stories(
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.otd_editions(id) on delete cascade,
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
  source_url text not null,
  language text,
  article_type text,
  confidence numeric(5,4) not null default 0,
  verification_notes text,
  position integer not null default 999,
  created_at timestamptz not null default now()
);
create index if not exists otd_stories_edition_position_idx on public.otd_stories(edition_id,position);

create table if not exists public.otd_sources(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.otd_runs(id) on delete cascade,
  edition_date date not null,
  source_url text not null,
  event_key text,
  era_key text,
  era_year integer,
  source_desk text,
  publication text,
  city text,
  issue_date date,
  page text,
  archive text,
  community text,
  language text,
  article_type text,
  title text,
  evidence_notes text,
  confidence numeric(5,4) not null default 0,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(run_id,source_url)
);

create table if not exists public.otd_approvals(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.otd_runs(id) on delete cascade,
  edition_id uuid references public.otd_editions(id) on delete set null,
  edition_date date not null,
  identity text not null,
  category text not null,
  scope text not null default 'story',
  event_key text,
  source_url text,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  payload jsonb,
  status text not null default 'pending',
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(run_id,identity)
);
create index if not exists otd_approval_pending_idx on public.otd_approvals(status,created_at);

create table if not exists public.otd_social_queue(
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.otd_runs(id) on delete cascade,
  edition_date date not null,
  platform text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);

-- The server uses the service role. Keep these tables closed to public clients.
alter table public.otd_runs enable row level security;
alter table public.otd_agent_jobs enable row level security;
alter table public.otd_editions enable row level security;
alter table public.otd_stories enable row level security;
alter table public.otd_sources enable row level security;
alter table public.otd_approvals enable row level security;
alter table public.otd_social_queue enable row level security;

-- Atomic serverless run lock. Prevents overlapping cron invocations from running the same stage twice.
create or replace function public.otd_claim_run(p_run_id uuid,p_token text,p_seconds integer default 285)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.otd_runs
     set lock_token=p_token,
         locked_until=now() + make_interval(secs => greatest(30,least(p_seconds,600))),
         updated_at=now()
   where id=p_run_id
     and (locked_until is null or locked_until < now() or lock_token=p_token);
  return found;
end $$;

create or replace function public.otd_release_run(p_run_id uuid,p_token text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.otd_runs
     set locked_until=null, lock_token=null, updated_at=now()
   where id=p_run_id and lock_token=p_token;
  return found;
end $$;

grant execute on function public.otd_claim_run(uuid,text,integer) to service_role;
grant execute on function public.otd_release_run(uuid,text) to service_role;
