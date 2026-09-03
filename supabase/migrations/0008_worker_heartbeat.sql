-- The price worker's heartbeat: one row that says "I am connected, and this
-- is what I am watching", refreshed every half minute while its socket to
-- EODHD is authorised (app/worker/main.ts).
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → new query → run).
--
-- Why it exists: two things can evaluate price rules — the worker, on every
-- trade, and the scheduled route (api/alerts-run.ts?scope=prices), every
-- few minutes. Both are correct on their own; both at once would compare
-- two providers' prices against the same level and could disagree by a
-- cent around it. So the route reads this row first and stands down while
-- the worker is alive, and takes over — at its slower cadence, from its
-- own provider — the moment the row goes stale.
--
-- Engine-only: RLS enabled with no policies, so no client can read or write
-- it. The service role bypasses RLS and never reaches the browser.

create table public.worker_heartbeat (
  name    text primary key,
  at      timestamptz not null,
  -- What the worker was doing when it wrote: connected, symbols watched,
  -- the last trade seen. For a human reading the table, not for the app.
  detail  jsonb not null default '{}'::jsonb
);

alter table public.worker_heartbeat enable row level security;
