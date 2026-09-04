-- The conversion funnel: four events, and nothing else.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → new query → run).
--
-- WHY THIS EXISTS. The recommendation flow is about to become the front door
-- for users with no holdings. That change has to be judged against a baseline
-- rather than against a feeling, so this table lands FIRST, measuring the
-- flow exactly as it is today, and the routing change ships afterwards.
--
-- WHAT IS STORED, and what deliberately is not. A row is: which of four
-- things happened, when, which browsing session it happened in, and a
-- per-device random id that ties one person's sessions together. That is the
-- whole schema.
--
-- There is NO user_id column, and adding one would be a mistake rather than
-- an improvement. The funnel questions — how many people start the four
-- questions, how many reach an allocation, how many reach the broker screen,
-- how many act — are all answered by counting distinct sessions per stage.
-- None of them needs to know WHICH person, so the identity is not collected.
-- `anon_id` is generated on the device (app/src/lib/analyticsIds.ts) and has
-- no join path to auth.users, public.profiles, or anything else here: it
-- cannot be resolved back to a person from this table, by us or by anyone
-- who obtains it.
--
-- The consequence, stated so nobody later reads it as a bug: one person using
-- two devices counts as two. That is the price of not collecting identity,
-- and for a funnel baseline it is the right trade.
--
-- INGEST. Rows arrive only through app/api/events.ts, which verifies the
-- caller's Supabase access token before writing and then throws the user id
-- away. The token check is there to keep the table from being a public write
-- endpoint, not to attribute the row. RLS below therefore grants the client
-- nothing at all.

create table public.funnel_events (
  id         uuid primary key default gen_random_uuid(),
  -- The four stages, closed by a check constraint. A fifth name is a schema
  -- change on purpose: an open text column is how a funnel quietly acquires
  -- six spellings of the same step and stops being countable.
  name       text not null check (
    name in ('reco_started', 'reco_completed', 'broker_screen_viewed', 'broker_action_clicked')
  ),
  -- One browsing session (a tab, until it is closed). The unit every funnel
  -- query counts distinctly.
  session_id text not null check (length(session_id) between 8 and 64),
  -- One device, across sessions. Random, device-generated, and joinable to
  -- nothing — see the note above.
  anon_id    text not null check (length(anon_id) between 8 and 64),
  created_at timestamptz not null default now()
);

-- The one shape every query below reads: a stage, over a date range.
create index funnel_events_name_created_idx on public.funnel_events (name, created_at desc);
-- Session-level rollups (did THIS session reach the broker screen?).
create index funnel_events_session_idx on public.funnel_events (session_id);

-- ── Row-Level Security ─────────────────────────────────────────────────

alter table public.funnel_events enable row level security;

-- No policies, deliberately — the same arrangement as public.alert_states in
-- 0007_alerts.sql. RLS enabled with no matching policy denies every client
-- operation outright; only the service role (which bypasses RLS, and never
-- reaches the browser) writes here, and reading is done from the SQL editor.
-- In particular the client cannot SELECT: a table of everyone's funnel
-- positions is not something a browser needs to be able to read.

-- ── Reading the funnel ─────────────────────────────────────────────────

-- The whole funnel, one row per stage, newest 30 days. `sessions` is the
-- number the conversion rates are built from; `devices` is there to show how
-- much of the traffic is one person reloading.
--
-- The stage ordering is spelled out rather than left to alphabetical order,
-- which would put broker_action_clicked first and make the funnel read
-- backwards.
create view public.funnel_summary as
select
  e.name,
  case e.name
    when 'reco_started' then 1
    when 'reco_completed' then 2
    when 'broker_screen_viewed' then 3
    when 'broker_action_clicked' then 4
  end                                as stage,
  count(*)                           as events,
  count(distinct e.session_id)       as sessions,
  count(distinct e.anon_id)          as devices,
  min(e.created_at)                  as first_seen,
  max(e.created_at)                  as last_seen
from public.funnel_events e
where e.created_at >= now() - interval '30 days'
group by e.name
order by stage;

-- Views run as their owner, so this one would hand out the readable summary
-- to any client that asked — the exact thing the empty policy set above
-- refuses. Postgres 15+ honours the invoker's own permissions instead.
alter view public.funnel_summary set (security_invoker = on);

revoke all on public.funnel_summary from anon, authenticated;
revoke all on public.funnel_events  from anon, authenticated;
