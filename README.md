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
npm run format     # prettier --write .
npm run format:check
```

**Formatting is Prettier, configured to the style the codebase already had**
(`.prettierrc`: `singleQuote`, `printWidth: 110`) rather than to Prettier's
defaults — so adopting it rewrapped long lines without rewriting the whole
tree to 80 columns and double quotes. Proof that the pass changed nothing that
ships: the production bundles it produces are byte-identical to the ones from
before it, down to Vite's content hashes.

Two things are deliberately left out of it (`.prettierignore`): **Markdown**,
because wrapping prose churns the docs on every edit, and **CSS**, because
Prettier lowercases hex colours and `tokens.css` carries the palette lifted
verbatim from the design file, where it is uppercase. A few hand-formatted
data literals in `demoAdapter.ts` carry `// prettier-ignore`: they are laid out
one row per record so they read as a table, and Prettier would explode each
row into a dozen lines and lose the shape of the data.

## Architecture — one component system

- **`app/src/styles/tokens.css`** — every color, radius, shadow and font, lifted
  verbatim from the design. Three global switches set as attributes on `<html>`:
  `data-theme` (dark default / light), `data-signal` (vivid / balanced / muted
  gain-loss colors), `dir` (rtl Hebrew default / ltr English). Change a token
  here and it propagates everywhere; no screen declares its own colors. Glass
  lives here too: the tint recipes and the specular rim that approximate iOS's
  Liquid Glass (the native material has no web API, and refraction is left out
  on purpose — it would cost an SVG displacement map per pane, over live
  charts). Panes wear it via `.card`, `.glass-bar` and `.glass-sheet`, never by
  writing their own `backdrop-filter`, which is what lets one
  `prefers-reduced-transparency` query take the translucency back out.
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

**Prices are not among them any more.** `SymbolInfo` is split by provenance:
`quote` (price, 52-week high, drawdown) is real, read from the daily mirror;
`demo` (day change, volume, market cap, P/E, RSI) is still the prototype's.
The split is the point — a call site writes `x.demo.changePct`, which says
what the number is at the moment it is rendered, where a flat `x.changePct`
sitting next to a real price would not. There is no price literal left
outside `demo`, so a failed mirror read has nothing to fall back to: `quote`
is null and every price on screen renders `—` through `moneyOrDash`. The
prototype price survives only as the basis for the still-demo figures derived
from it (the stock page's OHLC strip, after-hours line and dollar day-change)
and for valuing the demo portfolio, and never as *the* price.

Day change is the notable absence from `quote`: **the ranking has no
day-change field**, so it cannot be made real from this source and is not
borrowed from anywhere either. It stays demo until an intraday quote source
exists — which is why the standing on-screen note now names both halves
("prices are real … day change, volume, charts and portfolio figures are
still sample data") instead of calling the whole screen sample data, which
would have been the same failure in the other direction.

**Where the prices come from, and why it cost nothing.** The mirrored ranking
already carries `price` and `high_52w` for ~100 names and is refreshed daily
by the job that feeds the Satellite card. `fetchQuotes()` reads that same
snapshot through the same `readMirror` helper, so real prices arrived with no
new API key, no new quota, no browser-visible network call beyond the one the
app already made — which is why prices went real before anything else on the
list did. A ticker the ranking does not cover is simply absent from the map
and renders `—`; that is deliberately indistinguishable on screen from an
unreadable snapshot, because in both cases the app genuinely does not know
the price. The freshness gate is shared too: a snapshot too old for the
Satellite card is too old to price a watchlist with.

**The charts are real too, from a second mirror.** Everything the stock
page's chart and the movers' sparklines draw is a published trading session:
`app/src/data/priceHistory.ts` reads `app/public/data/series/<TICKER>.json`,
written daily by `.github/workflows/mirror-prices.yml` via
`scripts/mirror-prices.mjs`. What that replaced was a seeded pseudo-random
walk — and not only the line. The candle bodies were derived from the close
series (open was *yesterday's* close, the wicks a fixed ±1.6), the volume pane
was `8 + ((i * 37) % 26)`, a sawtooth that repeated every 26 candles for every
stock in the app, and "RSI" was `50 + (close - ma12) * 3.6`, which is not RSI
by any definition: unbounded, with no notion of gains against losses, and
scaled by the stock's own price, so the 30 and 70 lines drawn across its pane
were decoration. MA, RSI(14) and MACD(12,26,9) are now the actual indicators
on the actual closes, and they start where their window fills rather than
averaging whatever happens to sit at the left edge under a label claiming
fifty sessions.

**Why a separate mirror, and why a script.** Alpha Vantage's free key allows
tens of requests a day and must stay server-side, so the browser can never
call it — one visitor walking a few stock pages would spend the day's
allowance for everyone. Daily bars also change once a day by definition. The
screener mirror answers the same problem with a dozen `jq` assertions in YAML,
which is as far as that approach stretches; this job has to map a nested
payload into a sorted series, tolerate a symbol the provider does not cover
while *stopping* on a spent quota, and leave the previous good file untouched
in both cases. That is program logic, so it lives in a script with tests
(`app/src/data/mirrorPrices.test.ts`) that assert what the publisher writes is
what the reader accepts, rather than in a workflow runner.

Its publishing contract, and the honest states that follow from it:

| Mirror content | App shows |
| --- | --- |
| a fresh file for the ticker | the real sessions, and the key-stats rows a bar can answer |
| no file for the ticker | "no price history is published for this symbol yet" — a fact, not a failure, and not a retry prompt |
| a file whose newest session is over `MAX_SERIES_AGE_DAYS` old | "unavailable" with the age, never the stale sessions |
| unreadable, or any row in it unreadable | "unavailable" — the whole file, because a chart is read as a whole and a series with sessions silently dropped is a picture of price action that never happened |

`MAX_SERIES_AGE_DAYS` is 7 where the screener's gate is 4, deliberately.
`as_of` is the last *trading* session, so a Friday close read on the Tuesday
after a Monday holiday is already four days old with nothing wrong. The
asymmetry is also about what the number is for: a stale "last price" is
presented as today's and misleads directly, while a year of real sessions
missing its last few is still an honest year of history.

**What this deliberately does not cover: 1D.** The timeframe row offers 1W,
1M, 3M and 1Y and no 1D, because a daily series is one point per session — a
day is a single dot, and a 1D tab could only be filled by inventing the
intraday path. That needs an intraday feed, not a narrower slice of this one.
`MDA` is the standing example of the other gap: it trades in Toronto, the
provider has no US tape for it, and the publisher skips it rather than failing
the other nine tickers' refresh.

**One inconsistency worth knowing about.** The headline price comes from the
screener mirror and the chart's last close from this one, so on a given day
they can be a session apart. Both are real, and the OHLC strip is stamped with
the session it describes for exactly that reason. What is no longer possible
is the key-stats grid disagreeing with the chart above it: Open, Prev close,
Day range, Volume, Avg vol and RSI(14) are read from the same bars the chart
draws. They used to be `price - 1.9`, `price * 0.99`, `price - 3.1` to
`price + 2.4` and a frozen `162.4M` that was the same figure for every stock,
which put an "Open 231.85" directly beneath a chart strip reading "O 232.80"
for the same session.

**Two surfaces carry real engine data.** The second is the Satellite card:
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

**Tone tags.** EODHD scores some rows with its own `sentiment` object, and
`mapSentiment` (`app/api/_lib/news.ts`) buckets that `polarity` into
positive / negative / neutral, rendered as a green / red / grey chip in both
languages (`app/src/screens/news/sentimentTag.ts`). The threshold is ±0.05,
the VADER-style model's own documented cut-off rather than a number we picked.
A row the provider did not score carries **no tag at all** — not a "neutral"
one. "We were not told" and "the provider called this neutral" are different
claims, and only one of them is ours to make; sentiment ships on some EODHD
plans and some rows only, so this is the common case, not an edge case.

**Hebrew headlines.** The app is Hebrew-first but EODHD's feed is English, so
`GET /api/news?lang=he` translates each `headline` and `summary` to Hebrew
through the Google Cloud Translation API before answering
(`app/api/_lib/translate.ts`). `source`, `url`, `symbols` and `publishedAt` are
facts, not copy, and are never touched. The step is **best effort and cannot
fail the response**: if `GOOGLE_TRANSLATE_API_KEY` is unset, or the API errors,
times out, or the monthly free allowance is spent, the English articles are
returned with a normal `200`. That is not a silent
degradation — the articles are real, current and fetched successfully; only
the wording is the provider's. Hiding real headlines because a *secondary*
service is down would remove information the reader could have used, and
inventing a translation is not on the table. A batch is all-or-nothing: if
the API returns a different number of translations than it was sent, the whole
batch is discarded rather than paired up by index, which could put one
article's words under another's headline. Quota is defended by the edge cache
above (the language is part of the URL, so the two languages cache
separately), by sending each distinct string once, and by a small in-process
memo of recently translated strings that survives warm function invocations.
`lang` accepts only `en` (the default, and exactly the pre-translation
behaviour) or `he`; anything else is a `400` before any upstream call.

One provider quirk is handled rather than shipped to the screen: the v2 API
HTML-escapes its output even for `format: 'text'`, so `decodeEntities` undoes
that before the string leaves the function — otherwise a card would read
"Nvidia&#39;s" in the middle of Hebrew copy. Anything that is not a recognised
entity is left exactly as written, since a bare `&` is ordinary text in a
headline.

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
| סקירה / Overview | demo adapter + real holdings + both mirrors | real price, 52-week high, chart, and the key-stats rows a daily bar answers (open, prev close, day range, volume, avg vol, RSI); day change, market cap, P/E and analyst ratings still demo |
| דוחות / Reports | `/api/stock/{ticker}/fundamentals` (live, un-mirrored) | branches purely on the engine's `status` |
| חדשות / News | `/api/news` (this repo's Vercel function) | excerpts only, never a full article body |

The engine's view of a ticker is a **card, not a header field**, because most
symbols are not in a 100-name ranking: `fetchRankingRow` resolves `ok(null)`
for a healthy snapshot that simply does not cover this stock, which renders
as "not covered today" with no retry — deliberately not `unavailable`, since
nothing failed and there is nothing to retry. Day-change percent is **not**
in the ranking payload, so it is not shown there rather than being borrowed
from demo data.

All three mirror readers — the Satellite card's BUY list, a single stock's
ranking row, and the quote map behind every price in the app — share one
`readMirror` helper so transport, freshness and honesty handling cannot drift
between them. One serving a snapshot the other rejects is exactly the class of
bug the mirror's verification exists to prevent.

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
| Every price on screen (`SymbolInfo.quote`) | the same daily mirror | none |
| Stock page · chart, and the movers' sparklines | the daily price-history mirror in this repo | none |

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

**Environment variables**, added in the Vercel dashboard under
**Project → Settings → Environment Variables**, scoped to Production,
Preview, and Development so PR previews and local `vercel dev` also work. The
first two are required; the third only changes the language of the news:

| Variable | Used by |
| --- | --- |
| `EODHD_API_KEY` | `/api/news` — the news feed |
| `GOOGLE_TRANSLATE_API_KEY` | `/api/news?lang=he` — Hebrew headlines, via the Cloud Translation API. **Optional**: without it the news is served in the provider's English rather than failing. The key travels as the API's `key=` query parameter, so restrict it **to the Cloud Translation API** in the Google Cloud console — an HTTP-referrer restriction would break it, since the call is server-side. The first 500k characters a month are free, but the project still needs billing enabled. |
| `ALPHAVANTAGE_API_KEY` | `/api/earnings` — the calendar and per-stock history; also a **GitHub Actions secret**, where `mirror-prices.yml` spends one call per covered ticker per day. If it is the same key, the earnings route lives on what is left of the daily allowance. |

All three are read only server-side and none may be given a `VITE_` prefix,
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
