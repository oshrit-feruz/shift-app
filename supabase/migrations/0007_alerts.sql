-- Alerts that actually fire: where a fired alert is stored, what the engine
-- remembers between runs, and where a phone's push subscription lives.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → new query → run).
--
-- The alert RULES stay where they are — `savedAlerts`, `alertUpThreshold` and
-- `alertDownThreshold` inside user_state.state (0001_auth.sql). They are a
-- preference bag written wholesale by the client, and nothing here changes
-- that. What was missing was everything downstream of a rule: nothing read
-- the rules against a price, and the notification centre was a hardcoded
-- list. app/api/alerts-run.ts now does the reading, on a schedule, and writes
-- its results into these tables.
--
-- notifications      — one row per fired alert, the notification centre's
--                      contents. Written ONLY by the engine (service role);
--                      the client reads its own rows and marks them read.
-- alert_states       — the engine's memory: which side of its level each
--                      rule was on at the last check, and which article it
--                      saw last. This is what makes an alert fire on the
--                      CROSSING rather than on every run while the condition
--                      holds. Engine-only; no client access at all.
-- push_subscriptions — the browser's Web Push endpoint + keys, one row per
--                      installed device. The client writes its own; the
--                      engine reads them to deliver and deletes the ones the
--                      push service reports as gone.

-- ── Tables ─────────────────────────────────────────────────────────────

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- What fired. 'threshold' is the Settings percent rule, which renders with
  -- the equal-prominence "alert only" disclaimer; the other three are the
  -- alert sheet's kinds.
  kind        text not null check (kind in ('price', 'threshold', 'news', 'earn')),
  ticker      text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  -- Both languages, composed by the engine at firing time. The UI picks one.
  -- Stored rather than re-rendered from parameters so a notification reads
  -- the same tomorrow as it did when it fired, whatever the copy becomes.
  title_en    text not null,
  title_he    text not null,
  detail_en   text not null,
  detail_he   text not null,
  -- What makes two firings the same firing. A price alert crossing the same
  -- level on the same day, the same article matching twice, the same
  -- earnings reminder on a second run that morning: one row, not two.
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create unique index notifications_user_dedupe_idx
  on public.notifications (user_id, dedupe_key);
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create table public.alert_states (
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- The rule this state belongs to, as the engine keys it: which ticker,
  -- which condition, which level — so editing a threshold re-arms it, and
  -- deleting and re-creating the same rule does not fire on a crossing that
  -- already happened.
  key         text not null,
  -- 'above' | 'below' for a level rule; the newest article's timestamp for
  -- a news rule. Text because the two are different facts.
  state       text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- The push service's URL for this device. Unique on its own: one endpoint
  -- belongs to one browser profile, whoever is signed in there now.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  -- The app's language on the device when it subscribed, so the push text
  -- arrives in the language the person reads the app in.
  lang        text not null default 'he' check (lang in ('en', 'he')),
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ── Row-Level Security ─────────────────────────────────────────────────

alter table public.notifications      enable row level security;
alter table public.alert_states       enable row level security;
alter table public.push_subscriptions enable row level security;

-- auth.uid() wrapped in a scalar subselect throughout, per 0004_rls_initplan.

-- Notifications: read your own, mark your own read. No insert and no delete
-- for the client — a row exists because the engine observed something, and
-- a client that could insert one could also invent one.
create policy "own notifications read" on public.notifications
  for select using ((select auth.uid()) = user_id);
create policy "own notifications update" on public.notifications
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- alert_states: no policies at all. RLS enabled with no matching policy
-- denies every client operation; only the service role (which bypasses RLS)
-- reads or writes here, and the service role never reaches the browser.

-- Push subscriptions: the device registers and removes its own. Update is
-- for re-subscribing on the same endpoint with rotated keys.
create policy "own push read" on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);
create policy "own push insert" on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);
create policy "own push update" on public.push_subscriptions
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own push delete" on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);
