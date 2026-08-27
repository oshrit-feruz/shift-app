# Shift

A Hebrew-first (RTL) investing app for the Israeli market, implemented from the
Claude Design mockups in [`design-reference/`](design-reference/). React + Vite +
TypeScript, mobile-first.

## Run

```bash
cd app
npm install
npm run dev        # app at http://localhost:5173/  ·  design system at /ds.html
npm test           # vitest — advisory profile mapping + formatters
npm run build      # tsc --noEmit + vite build (app + design-system page)
```

## Architecture — one component system

- **`app/src/styles/tokens.css`** — every color, radius, shadow and font, lifted
  verbatim from the design. Three global switches set as attributes on `<html>`:
  `data-theme` (dark default / light), `data-signal` (vivid / balanced / muted
  gain-loss colors), `dir` (rtl Hebrew default / ltr English). Change a token
  here and it propagates everywhere; no screen declares its own colors.
- **`app/src/components/`** — the component library (Card, Button, Tag,
  TickerTile, ListRow, AllocationBar, DonutChart, CandleChart, Sheet, ChatBubble,
  TabBar, …). Screens in `app/src/screens/` compose only these.
- **`app/ds.html` → `src/ds/DesignSystemPage.tsx`** — the living design-system
  reference. It renders the *real* components against the *real* tokens, so it
  cannot drift from the app.
- **`app/src/i18n/strings.ts`** — every user-facing string as an `{en, he}`
  pair. Numbers always render through `<Num>` (LTR isolation inside RTL text).

## Product rules (implemented, not just displayed)

- **Two tracks.** Self-directed (watchlist, movers, news, stock pages, own
  portfolios — including the manual **Sandbox** theoretical portfolio, the only
  place "Add transaction" exists; broker-linked portfolios are read-only
  synced) and the **"קבלי המלצה" advisory track**.
- **Deterministic advisory mapping** (`app/src/lib/advisory.ts`, unit-tested):
  four answers → fixed scoring → Conservative (0% satellite) / Balanced (10%) /
  Growth (15%); **hard rule:** horizon under 2 years OR no safety net ⇒
  Conservative regardless of the other answers. No discretion, no per-user
  tuning. The Satellite sleeve follows the published Recovery Detector rule set,
  identical for every client, capped at 15%.
- **Three independent onboarding pieces**, each skippable and re-enterable: app
  tour, always-accessible learning library (+ "open an account" guide + first
  steps checklist), and the guided advisory flow (chat → profile confirm →
  disclosure → recommendation → broker selection → read-only institution
  connection → first-purchase *simulation*), resumable via the
  "השלימי את ההגדרה" banner.
- **No trade execution anywhere.** Broker opening is a referral hand-off to the
  broker's own site; account connections are read-only; alerts (including the
  opt-in percent thresholds in Settings) are informational only — a fired
  threshold notification carries the fixed equal-prominence disclaimer and a
  mark-as-read affordance, never a confirm/execute button.
- **Data honesty** (`app/src/data/`): every data-service method returns
  `loading | unavailable | ok`, and screens render all three honestly — an API
  failure shows an explicit "unavailable" state, never a fabricated number, and
  a day with no Satellite candidates renders as genuinely empty rather than as
  an error. Settings → Data & display carries a single "data unavailable" demo
  switch (`DEMO_FLAGS.unavailable`), which deliberately does **not** apply to
  the Satellite card — that card's empty and unavailable states come from the
  real mirrored data, so there is nothing left to simulate. Pension /
  hishtalmut / bank show totals by provider only, in a separate read-only
  section, never merged into the managed portfolio number.

## Data

`app/src/data/demoAdapter.ts` is a clearly-labeled **demo** implementation of
the `DataService` interface (`service.ts`) carrying the prototype's numbers. A
real backend drops in by implementing that interface; no UI changes needed.

**One surface carries real engine data:** the Satellite card.
`satelliteSignals()` delegates to `app/src/data/recoveryDetector.ts`, which
reads the Recovery Detector screener's BUY signals. Field names are mapped
defensively (`ticker|symbol`, `price|current_price|last`, `drawdown_pct|
drawdown`; numeric strings tolerated).

It reads a **daily mirror, not a live call.** The engine runs on Render's free
tier, which sleeps after ~15 minutes idle and takes 30-60s to wake, while the
screener only recomputes once a day (its response says so in `computed_on`) —
so paying that cold start on every visit bought nothing but latency.
`.github/workflows/mirror-screener.yml` fetches the day's result at 12:15 UTC
(the engine's own job runs at 11:30) and commits it to
`app/public/data/screener.json`; the app reads that static file from Vercel's
edge and never touches Render. Anything that genuinely must be fresh (news,
live prices) goes through a Vercel function instead.

That workflow **verifies before it publishes**, the discipline the engine repo
documents in its own ARCHITECTURE.md: it asserts the payload is an object with
a non-empty `full_ranking` whose rows carry tickers, and fails loudly if not.
Verification runs *before* anything is written, so a bad fetch can never
overwrite the last good file. It stages with `git add` and then diffs
`--cached` — plain `git diff` reports no change for an untracked file, so a
brand-new mirror would silently never be committed.

That path has **no demo fallback, by design**:

| Mirror content | App shows |
| --- | --- |
| BUY signals present, snapshot fresh | the real rows; a missing number renders `—` rather than being guessed |
| no BUY signals, snapshot fresh | the honest empty state — zero candidates is a valid answer on a quiet day, not an error |
| snapshot older than 4 days, or file missing | "unavailable" **with the specific reason**, never the stale rows |
| unparseable / unrecognised shape | the honest "unavailable" state with a retry |

The Settings → Data & display "no satellite positions" demo switch was removed
when this went live: its empty state is now whatever the engine actually
reports, and the remaining "data unavailable" switch deliberately does not
apply to this call.

Operational notes for whoever deploys this:
- **CORS is no longer in the path** for the screener: the mirror is served
  from the app's own origin, so there is no cross-origin fetch to fail.
- **A stale mirror is reported, never served quietly.** If the snapshot is
  older than `MAX_SNAPSHOT_AGE_DAYS` (4 — enough for a long weekend), or the
  file is missing entirely, the card shows the honest unavailable state with a
  specific reason ("נתוני השוק בני 9 ימים, ולכן אינם עדכניים") rather than
  presenting week-old signals as today's. A broken mirror must look broken,
  not like a quiet market.
- **Per-ticker endpoints still hit Render directly** and cannot be mirrored the
  way one daily ranking can — `/api/stock/{ticker}/fundamentals` is on-demand
  per ticker. Those calls still pay a cold start of up to ~60s on the first
  request after an idle period, so anything built against
  `RECOVERY_DETECTOR_ORIGIN` needs a loading state that survives that wait.

**A second live surface:** stock news. `app/api/news.ts` is a Vercel
serverless function that proxies EODHD's News API — a server-side proxy,
never called from the browser directly, so the API key never reaches the
client. Request: `GET /api/news?ticker=NVDA`. Response: up to 10 real
headlines with `headline`, `source`, `publishedAt`, a 1–2 sentence `summary`
excerpted from the article body (never the full text, for copyright reasons),
and the external `url` — never a full article body.

Same honesty contract as the satellite feed: any upstream failure (network,
timeout, non-2xx, unparseable or unexpected-shape body) returns a `4xx`/`5xx`
with an `{ error, message }` body for the frontend to render as
"unavailable" — never stale-cached or invented headlines.

**Quota defence, in two layers.** A successful response carries
`Cache-Control: public, max-age=0, s-maxage=60`, so Vercel's edge serves
repeat requests for the same ticker without spending an EODHD call — at worst
one upstream call per ticker per minute however many people are reading.
**Failures set no cache header at all**, which is what makes them uncacheable
on Vercel: a transient EODHD hiccup must never be frozen and served to
everyone for the full TTL. There is deliberately no `stale-while-revalidate`,
for the same reason. Second, an invalid or missing ticker is rejected
*before* any upstream call, so a bad request costs nothing — asserted in the
tests by the absence of the call, not just the status code, since the status
alone would keep passing if the guard drifted below the fetch.

Not yet covered: **per-client rate limiting**. The cache is shared, so it
blunts repeat load on one ticker but not a single client walking a thousand
different ones. That needs a durable counter (Vercel KV or Upstash Redis) and
is flagged in `app/api/news.ts` as a follow-up for when the app goes
genuinely public. A ticker with fewer
than 10 (or even zero) recent real articles returns that shorter real list
as-is rather than padding it out.

**A third live surface:** the stock detail screen's Reports tab.
`app/src/data/fundamentals.ts` calls the engine's
`/api/stock/{ticker}/fundamentals`, which returns filed figures straight from
SEC EDGAR. This one **is not mirrored** — it is per-ticker and on-demand, so
it cannot be pre-fetched the way a single daily ranking can, and it still
pays Render's cold start of up to ~60s on the first request after an idle
period. Its timeout is set accordingly and the tab shows a skeleton that
survives the wait.

The engine answers **HTTP 200 for everything**, including a ticker it has no
data for, so the `status` field in the body is the only signal and the data
layer branches purely on it. Anything that is not literally `'ok'` — an
unrecognised status included — is unavailable; a body we do not understand is
never optimistically read as good data. ETFs and non-US listings legitimately
have no EDGAR filings, so "no filed figures" is a normal answer there rather
than a malfunction, and it reads differently from "could not reach the
service" so a cold start is not mistaken for a missing company.

Filing date and form render alongside the revenue figure, never optionally:
the engine documents this number as display-only and explicitly **not**
point-in-time (newest filing on record, no reporting lag), so showing which
filing it came from is what keeps it honest.

## Stock detail screen

`app/src/screens/Stock.tsx` carries three sub-tabs (`screens/stock/`), each
owning its own data source and loading only when opened — so a stock page
costs at most one Render call, and only when someone actually asks for
filings:

| Tab | Source | Notes |
| --- | --- | --- |
| סקירה / Overview | demo adapter + real holdings + the mirrored ranking | chart, your position, key stats, analyst ratings, and the engine's own view |
| דוחות / Reports | `/api/stock/{ticker}/fundamentals` (live, un-mirrored) | branches purely on the engine's `status` |
| חדשות / News | `/api/news` (this repo's Vercel function) | excerpts only, never a full article body |

The engine's view of a ticker is a **card, not a header field**, because most
symbols are not in a 100-name ranking: `fetchRankingRow` resolves `ok(null)`
for a healthy snapshot that simply does not cover this stock, which renders
as "not covered today" with no retry — deliberately not `unavailable`, since
nothing failed and there is nothing to retry. Day-change percent is **not**
in the ranking payload, so it is not shown there rather than being borrowed
from demo data.

Both mirror readers share one `readMirror` helper so transport, freshness and
honesty handling cannot drift between them — one serving a snapshot the other
rejects is exactly the class of bug the mirror's verification exists to
prevent.

**RTL note:** localized Hebrew dates are *not* wrapped in `<Num>`. `<Num>`
forces LTR isolation, which is right for numerals and wrong for Hebrew text —
it reverses the word order on screen. Provider-supplied headlines and
summaries carry `dir="auto"` so an English article reads as English inside
the Hebrew page instead of having its punctuation thrown to the wrong side.
Both were caught by looking at the rendered screen, not by a passing test.

### Where each surface's data comes from

| Surface | Source | Cost per refresh |
| --- | --- | --- |
| News screen · הכול / שווקים / אנליסטים | `/api/news` with **no** ticker — EODHD's general market feed | 5 credits |
| News screen · הווטצ׳ליסט שלי | `/api/news?ticker=` once per followed stock | 10 credits × watchlist size |
| News screen · דוחות כספיים | `/api/earnings?from=&to=` — this calendar week | 1 Alpha Vantage call |
| Stock page · חדשות | `/api/news?ticker=` | 10 credits |
| Stock page · דוחות (filed revenue) | engine `/api/stock/{ticker}/fundamentals` | — |
| Stock page · רבעונים שדווחו | `/api/earnings?ticker=&from=&to=` — 12 quarters | 1 Alpha Vantage call |
| Satellite card | the daily mirror in this repo | none |

The general feed is why the browsable news screen is cheap: EODHD's `s`
parameter takes **one** symbol at a time and a per-ticker call costs double,
so fanning out over a list of large caps would have cost ~70 credits per
refresh where the feed costs 5. The watchlist tab is the one place a fan-out
is justified — the per-stock scoping *is* the feature there, and the list is
short. Its requests run concurrently and merge into one feed, de-duplicated
by URL because a single story often carries several tickers.

**Partial failure is not total failure** on the watchlist: if some tickers
answer and others fail, the ones that answered are shown. Only an
all-tickers-failed result is `unavailable` — blanking a feed over one bad
ticker would hide real news the user could have read.

**Clicking a headline opens the source, not a sheet.** The demo feed this
replaced carried a full article body; real articles deliberately carry only a
1–2 sentence excerpt, so there is nothing to open in-app and the card links
out. Keeping the in-app reader would have meant either an empty sheet or
re-introducing the full text the proxy exists to avoid.

### Earnings calendar (`app/api/earnings.ts`)

Proxies **Alpha Vantage** so the key stays server-side. One route answers two
questions from two upstream functions: `EARNINGS_CALENDAR` for the whole
market in a window, `EARNINGS` for one company's reported quarters. Neither
takes a date range — one returns a fixed horizon, the other a whole history —
so the window is applied after mapping, in the function.

**Why not EODHD, which serves the news feed.** Its calendar and fundamentals
endpoints both answer `403` on this account's key: the Calendar API is in
EODHD's ALL-IN-ONE plan ($99.99/mo) and earnings history sits inside the
Fundamentals feed ($59.99/mo), while this key covers the News API. Alpha
Vantage answers both on a free key — verified against their live API before
the switch: 122 quarters for IBM with actual, estimate and surprise, and
~1,570 scheduled reports for a three-month horizon. The route's response
shape is unchanged, so the client was untouched by the switch and switching
back is this file plus its adapter.

**One honest difference, stated on screen.** `EARNINGS_CALENDAR` lists only
reports that have **not happened yet**, so the week calendar shows who is due
to report and carries no `actual` for a company that already has. The
calendar says so above the week rather than leaving a reader to conclude the
app thinks Monday's reporter is still pending. Per-stock history is
unaffected — `EARNINGS` carries the reported figures.

**Two traps this provider sets, both handled:**

1. It reports its own failures with **HTTP 200** and a JSON body carrying
   `Information`, `Note` or `Error Message` — including on the CSV route. A
   caller that checks only the status reads a spent quota as an empty week.
   `readApiError()` runs before anything is mapped, and a quota notice
   becomes `upstream_rate_limited`.
2. When it rejects a key on the CSV route it answers the **real header plus
   one junk line**, which parses cleanly to zero rows. Found by calling the
   live API, not by reading docs. Data lines that *all* fail to map are now
   an unreadable body, never an empty week; a header with no data lines is
   still a legitimate quiet week.

The free key allows only tens of requests a day, which is why the successful
response carries `s-maxage=21600` (six hours) rather than the news route's
minute: a scheduled report date does not move between two page loads, and a
short TTL would spend the day's quota on freshness nobody can perceive and
then start answering "quota reached" to real readers.

The calendar week is anchored **Monday–Sunday**, not "the next seven days",
so the day strip reads as a calendar week instead of sliding forward daily.
The client's history window is **derived** from the endpoint's own
`MAX_RANGE_DAYS` rather than hand-written twice
(`app/src/data/earnings.ts`), with a test asserting the two stay in
agreement — the same publisher/reader discipline the screener mirror uses.

**Required environment variables**, both added in the Vercel dashboard under
**Project → Settings → Environment Variables**, scoped to Production,
Preview, and Development so PR previews and local `vercel dev` also work:

| Variable | Used by |
| --- | --- |
| `EODHD_API_KEY` | `/api/news` — the news feed |
| `ALPHAVANTAGE_API_KEY` | `/api/earnings` — the calendar and per-stock history |

Both are read only server-side and neither may be given a `VITE_` prefix,
which would bundle it into the client build.

Pure request/response mapping lives in `app/api/_lib/news.ts` (unit-tested in
`news.test.ts`) so it doesn't require mocking global `fetch` or a Vercel
request/response pair to test. The `api/` directory has its own
`tsconfig.json` (`npm run typecheck:api`) since it's excluded from the main
app's `src`-scoped one and isn't bundled into the client build.

## ⚠ Needs product sign-off before production

- **Core fund names** (VOO / IEFA / LQD / VMFXX / EEM in
  `app/src/lib/advisory.ts`) are realistic placeholders. The specific global
  government-bond instrument is omitted pending approval; all fund choices
  remain a material product decision.
- **Fund domicile is unresolved.** Every placeholder above is a
  **US-domiciled** ETF. For Israeli investors that carries US dividend
  withholding and US estate-tax exposure on US-situs assets, which
  Irish-domiciled (UCITS) equivalents are commonly used to mitigate. This is
  deliberately left as-is for now: the licensed execution partner determines
  the fund universe actually available, so domicile should be settled
  together with that partner rather than picked here. Needs confirmation
  from a qualified tax adviser, not from this note.
- Broker/provider logos in `app/public/assets/` are third-party brand assets
  carried over from the design mockups for demo purposes.
