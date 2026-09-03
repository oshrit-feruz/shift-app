# The price worker

One process that holds EODHD's US trades socket open and checks every price
rule on every trade. It replaces the scheduled route's "every five minutes,
regular hours only" with "within a second, 04:00–20:00 New York time,
pre-market and after-hours included". The route keeps running and stands
down while this is alive — see `worker_heartbeat` in
`supabase/migrations/0007_worker_heartbeat.sql` — so a dead worker degrades
to the slower cadence rather than to silence.

It decides nothing of its own: the rules, the memory, the notification rows
and the push are `api/_lib/alerts.ts` and `api/_lib/alertStore.ts`, shared
with the route. `worker/engine.ts` turns a trade into those calls;
`worker/feed.ts` keeps the socket up; `worker/main.ts` runs the three loops.

## What the feed is, honestly

- **One connection per API key.** A second one is refused with 403. That
  includes any tool that opens the socket for a probe; while this runs,
  nothing else may.
- **50 symbols per connection** (upgradeable in the EODHD dashboard). The
  worker watches the first 50 of the sorted union of every price rule's
  ticker and every held ticker of a user with a threshold; the rest are named
  in the heartbeat's `skipped` and cannot fire until the list shrinks.
- **US stocks only**, from a single lit exchange, 04:00–20:00 New York. A
  rule on a Toronto or London symbol is never watched here; the route still
  checks it on its schedule.
- **The price in the notification is the feed's last trade**, not the
  Finnhub quote the app prints beside it. They differ by cents and seconds.

## Run it locally

```sh
cd app
EODHD_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run worker
curl localhost:8080/healthz
```

Push needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` too;
without them alerts are recorded in the app and the log says
`push.not_configured`.

## Deploy on Fly.io (one-time)

**Not `fly launch`.** That command runs a wizard that wants to decide the
region and the machine size for you — it asks for the region in a browser,
and it defaults to 1GB of RAM where `fly.toml` here asks for 256MB, which is
the difference between ~$2 and ~$6 a month. `fly.toml` already carries the
app name, the region and the size, so create the app and deploy it directly
and the file is used verbatim.

1. Run `supabase/migrations/0007_worker_heartbeat.sql` in the SQL editor.
2. Install `flyctl` and `fly auth login`. Fly asks for a payment method
   before it will place a machine, even for the small one this uses.
3. From `app/`, create the app (no wizard, no deploy yet):
   ```sh
   fly apps create shift-alerts-worker
   ```
4. Secrets, never in the file:
   ```sh
   fly secrets set EODHD_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
     VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…
   ```
5. `fly deploy`. Then `fly logs` should show `socket.open`, a
   `socket.status {"code":200,"message":"Authorized"}` and a `subscriptions`
   line; `curl https://shift-alerts-worker.fly.dev/healthz` answers 200 with
   the same status the heartbeat writes.
6. `fly scale show` — confirm 256MB. If a machine came up larger,
   `fly scale memory 256`.

Railway or Render work the same way: build from `app/` with
`worker/Dockerfile`, set the same variables, keep one instance always on,
point the health check at `/healthz`.

## Reading the log

Every line is one JSON object with `at` and `event`:

| event | meaning |
| --- | --- |
| `socket.open` / `socket.close` / `socket.error` | the connection's life; a close is followed by a reconnect with backoff |
| `socket.status` | the feed's own status frame — `200 Authorized` on connect, `422` for a rejected subscription |
| `subscriptions` | what the last refresh added, removed and could not fit |
| `fired` | a trade crossed a rule: how many firings, how many were new rows, how many pushed |
| `refresh.failed` / `persist.failed` / `heartbeat.failed` | a Supabase call failed, with the table; counted in `storeFailures` |
| `push.not_configured` | no VAPID keys: rows only, no banners |

`/healthz` is 200 only while the socket is authorised **and** the rules were
re-read within three minutes; otherwise 503 with the same body, so a platform
health check restarts a machine that lost either.
