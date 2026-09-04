# Reading the conversion funnel

Four events, one table, and the queries that turn them into numbers. Paste any
of these into the Supabase SQL editor (Dashboard → SQL Editor → new query).

Nothing here needs a deploy, a dashboard login, or a build step. If a query
returns no rows, that means no events — not a broken query; see
[When the numbers look wrong](#when-the-numbers-look-wrong).

## What is being measured

| Stage | Event | Fired when |
|---|---|---|
| 1 | `reco_started` | the four-question screen opens (`screens/advisory/Chat.tsx`) |
| 2 | `reco_completed` | the allocation screen opens (`screens/advisory/Recommendation.tsx`) |
| 3 | `broker_screen_viewed` | the broker screen opens (`screens/advisory/Connect.tsx`) |
| 4 | `broker_action_clicked` | **primary KPI** — the user opens an account at a broker (`screens/advisory/Connect.tsx`) or starts a read-only link (`components/ConnectBrokerage.tsx`) |

Stages 1–3 are recorded **once per browsing session** however often their screen
mounts. Stage 4 is recorded on **every** click, because it is an act rather than
a state — so `events` can exceed `sessions` on that row, and that is not a bug.

Each row is the stage, a per-tab `session_id`, a per-device `anon_id`, and the
server's timestamp. There is no user id, by design — see the header comment in
`supabase/migrations/0011_funnel_events.sql`.

## The funnel, last 30 days

```sql
select * from public.funnel_summary;
```

`sessions` is the number to build rates from. `devices` shows how much of the
traffic is one person reloading.

## Conversion rates

The number the whole exercise is for: of the sessions that started, how many
acted.

```sql
with stage as (
  select
    count(distinct session_id) filter (where name = 'reco_started')          as started,
    count(distinct session_id) filter (where name = 'reco_completed')        as saw_allocation,
    count(distinct session_id) filter (where name = 'broker_screen_viewed')  as saw_broker,
    count(distinct session_id) filter (where name = 'broker_action_clicked') as acted
  from public.funnel_events
  where created_at >= now() - interval '30 days'
)
select
  started,
  saw_allocation,
  saw_broker,
  acted,
  round(100.0 * saw_allocation / nullif(started, 0), 1) as pct_reached_allocation,
  round(100.0 * saw_broker     / nullif(started, 0), 1) as pct_reached_broker,
  round(100.0 * acted          / nullif(started, 0), 1) as pct_acted
from stage;
```

`nullif(..., 0)` is deliberate: with no sessions yet, these read `null` — "we do
not know" — rather than `0`, which would claim a measured conversion rate of
zero. That is the same rule the app's own screens follow for a price it does not
have.

## Baseline vs. after the change

Run this once the routing change has shipped, with the deploy date in place of
`2026-01-01`. It is the comparison the whole instrumentation-first sequence
exists to make possible.

```sql
select
  case when created_at < timestamptz '2026-01-01' then 'before' else 'after' end as period,
  count(distinct session_id) filter (where name = 'reco_started')          as started,
  count(distinct session_id) filter (where name = 'broker_action_clicked') as acted,
  round(
    100.0 * count(distinct session_id) filter (where name = 'broker_action_clicked')
          / nullif(count(distinct session_id) filter (where name = 'reco_started'), 0),
    1
  ) as pct_acted
from public.funnel_events
group by period
order by period desc;
```

Compare like with like: the flow is only reachable while signed in, so both
periods count authenticated sessions only.

## Daily trend

```sql
select
  date_trunc('day', created_at)::date as day,
  count(distinct session_id) filter (where name = 'reco_started')          as started,
  count(distinct session_id) filter (where name = 'reco_completed')        as saw_allocation,
  count(distinct session_id) filter (where name = 'broker_screen_viewed')  as saw_broker,
  count(distinct session_id) filter (where name = 'broker_action_clicked') as acted
from public.funnel_events
where created_at >= now() - interval '30 days'
group by day
order by day desc;
```

## When the numbers look wrong

Read this before concluding anything from a surprising figure.

- **Every stage reads zero.** Most likely `0011_funnel_events.sql` has not
  been run on this project. Migrations are never applied by a build, so a
  deployed app writes into a table that does not exist and every insert is
  refused. Confirm the table exists before concluding nobody used the flow:
  `select count(*) from public.funnel_events;` — an error there is the
  answer, and it is a different answer from `0`.
- **Stage 4 without stage 3 in the same session.** Expected. The read-only
  connect card also lives on the Connections and connected-account screens,
  which are reachable without the flow's broker step. Every query above counts
  each stage independently rather than assuming an order, for this reason.
- **`events` far above `sessions` on stage 4.** Also expected — repeated clicks
  are all recorded. Use the `sessions` column for rates.
- **Devices roughly equal to sessions.** Means little repeat usage, or storage
  being cleared between visits. It does not mean the ids are broken.
- **One person counted twice.** A person on two devices is two `anon_id`s.
  That is the deliberate cost of not collecting identity, not a defect.
- **A gap in the series.** Events are fire-and-forget by design
  (`src/data/analytics.ts`): a write lost to a closing tab or a flaky network
  is dropped rather than retried, because measurement must never delay or break
  the screen it measures. Treat the counts as a slight **undercount**, never as
  an upper bound.
- **Only signed-in sessions are counted.** The insert policy admits
  `authenticated` alone, and the flow is unreachable while signed out in any
  case. Both sides of a before/after comparison are therefore
  authenticated-only, which is what makes them comparable.

