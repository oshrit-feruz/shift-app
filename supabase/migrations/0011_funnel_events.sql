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
-- INGEST: the client writes here directly, with the anon key, under the
-- insert-only policy below. There is deliberately no API route in front of
-- it. The route this replaced verified a bearer token and then threw the
-- resolved id away — which is exactly what `to authenticated` does here, in
-- the database, without spending one of the deployment's twelve serverless
-- function slots on a hop that added nothing. See the grant note below for
-- the one thing the route did that a bare policy would not.

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

-- ONCE PER SESSION for the three view stages, enforced here rather than only
-- in the client.
--
-- The client keeps its own guard (src/data/analytics.ts), but a guard living
-- in the browser is a guard the browser can lose — a reload, a second tab
-- restored into the same session, storage that throws — and each of those
-- would file a second "saw the allocation" row for one person who saw it
-- once. That inflates precisely the column this table exists to report, so
-- the rule belongs where it cannot be lost.
--
-- It doubles as the cheapest abuse control available without a server: a
-- signed-in browser can still write a view event it did not earn, but it
-- cannot write the same one a thousand times to bend a report.
--
-- broker_action_clicked is deliberately excluded. Clicking twice is two acts,
-- and collapsing them would lose the distinction between someone who tried
-- once and someone who kept trying.
create unique index funnel_events_one_view_per_session_idx
  on public.funnel_events (session_id, name)
  where name <> 'broker_action_clicked';

-- ── Row-Level Security ─────────────────────────────────────────────────

alter table public.funnel_events enable row level security;

-- Supabase grants `anon` and `authenticated` table-wide access on new tables
-- in `public` by default, so the grant is taken away first and handed back
-- one column at a time — the same two-step 0006_snaptrade.sql and
-- 0009_alert_hardening.sql use.
revoke all on public.funnel_events from anon, authenticated;

-- INSERT ONLY, and only these three columns.
--
-- Naming the columns is what keeps `created_at` honest: it is the server's
-- clock, and a client that could set it would be able to file events into
-- last week and quietly bend every date range in the report. A row policy
-- says which ROWS may be written and nothing about which COLUMNS, so the
-- policy below could not express this on its own — the column grant is doing
-- the work, exactly as it does for `read_at` on notifications in 0009.
grant insert (name, session_id, anon_id) on public.funnel_events to authenticated;

-- `to authenticated` is the whole access rule: somebody signed in may record
-- an event. `with check (true)` because there is nothing about the row to
-- constrain per-user — no user_id to match against auth.uid(), by design.
--
-- WHAT THIS DOES AND DOES NOT DEFEND AGAINST, stated plainly because these
-- numbers get quoted in decisions. A signed-in user can write a well-formed
-- event they did not earn. Three things bound what that is worth: the column
-- check constraints reject a malformed row, the partial unique index above
-- caps view stages at one per session, and there is nothing here to steal or
-- escalate — no identity, and no read access to what anyone else recorded.
--
-- What it is NOT is a defence against a determined signed-in user minting
-- fresh session ids in a loop to pad a stage. Doing better needs
-- server-controlled ingestion (an allowlist and a rate limit the browser
-- cannot skip), and the deployment has no serverless function slot left to
-- put one in — twelve of twelve are spoken for, which is what removed the
-- route this replaced. So treat these as internal product metrics, honest
-- about their own precision, and not as figures to defend externally.
create policy "signed-in insert" on public.funnel_events
  for insert to authenticated with check (true);

-- No SELECT policy and no select grant: a table of everyone's funnel
-- positions is not something a browser needs to read, and the app never
-- reads it. Reading is done from the SQL editor — see docs/funnel.md.
-- No UPDATE and no DELETE either: an event is a fact about something that
-- happened, and nothing in the app has any business revising one.

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
-- to any client that asked — the exact thing the missing select grant above
-- refuses. Postgres 15+ honours the invoker's own permissions instead.
alter view public.funnel_summary set (security_invoker = on);

revoke all on public.funnel_summary from anon, authenticated;
