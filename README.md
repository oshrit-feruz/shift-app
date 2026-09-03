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
  portfolios — manual **theoretical portfolios** are the only place "Add
  transaction" exists, and they are the user's own ledger, not a fixture;
  broker-linked portfolios are read-only synced) and the **"קבלי המלצה" advisory track**.
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

## Home-screen only (the install gate)

**On a phone, in production, the app runs only from its own icon.** A mobile
browser that opens it in a tab gets `screens/InstallGate.tsx` instead of the
app — ahead of the sign-in gate, so nobody is asked to authenticate into
something they cannot then use.

The whole decision is three booleans (`app/src/lib/install.ts`, unit-tested in
`install.test.ts`), and it deliberately blocks the narrowest case that can
actually comply:

| | |
| --- | --- |
| **enforced** | Production builds (`import.meta.env.PROD`). `VITE_REQUIRE_INSTALL=false` turns it off for a scope — Vercel's Preview, say — and `=true` turns it on in `npm run dev` to see the screen. |
| **mobile** | `(pointer: coarse) and (hover: none)` — a capability query, not a UA sniff. A touchscreen laptop still reports hover and a fine pointer for its trackpad, so it is not caught; an iPad, which claims a desktop UA, is. |
| **standalone** | `(display-mode: standalone / minimal-ui / fullscreen / window-controls-overlay)`, **or** `navigator.standalone` — iOS has never implemented the media query, so the non-standard property is the only signal there. Watched, not read once, so the gate lifts the moment a window changes display mode. |

**Desktop is never gated.** There is no home screen to add to on a Mac, and
Safari cannot install a PWA at all, so enforcing it there would be a wall
rather than a gate — it would lock out every desktop reviewer and tester.
Desktop instead gets the same install offer as an optional card in Settings.

**There is no "continue anyway".** The rule is that a browser tab is not a
supported surface; an escape hatch would quietly make it one. What the screen
owes the user in exchange is the way out, and only one platform can be given a
button:

- **Chromium (Android, desktop Chrome/Edge)** — the captured
  `beforeinstallprompt` event opens the native install dialog in one tap.
  The event fires **once, early**, before React has mounted, so it is caught
  at boot in `main.tsx` (`startInstallPromptCapture`) and held outside React;
  a listener registered in a component effect misses it and the button never
  appears.
- **iOS Safari** — there is no install API whatsoever. The screen draws the
  tap sequence instead of describing it: three rows, each the glyph the user
  is looking for on their own screen (Safari's Share box-with-an-arrow, the
  plus-in-a-screen of "Add to Home Screen", a check) with two words beside it.
  A paragraph explaining where a button is takes longer to read than the
  button takes to find. Above the list, `components/InstallDemo.tsx` plays the
  sequence on a small phone: the Share button lighting up under a tap ring,
  the sheet that arrives, the row to choose in it, and the icon landing on a
  home screen. An arrow was tried first and was the wrong instrument — it can
  point at a toolbar, but a toolbar has five buttons, and it cannot show what
  the next screen looks like. Every other button in the drawn toolbar is an
  abstract grey pill, so the one glyph that is drawn properly is the one to
  press. It is CSS on one shared 9s timeline with negative delays, not a JS
  timer or a screenshot: a screenshot of iOS ages with every release and would
  have to exist twice for the two languages. Under
  `prefers-reduced-motion` the demo is removed rather than frozen — frozen,
  its three scenes would stack — and the numbered list carries the
  instruction, which is also why the demo is `aria-hidden`.

  **There is no shortcut past this on iOS, and none can be written.** Apple
  exposes no install API, no URL scheme and no Shortcuts action that adds a
  web app to the home screen — the Share sheet is the only route, by design.
  Anything here that claims otherwise would be a button that silently does
  nothing.
- **Chrome, Firefox and Edge on iOS 16.4 or later** — that release is where
  Apple gave third-party browsers "Add to Home Screen" in their own share
  menu, so they get the same three steps as Safari. Below 16.4 the item does
  not exist for them at all, and the version is read from the UA
  (`supportsThirdPartyInstall`, unit-tested at the 16.3/16.4 boundary): those
  sessions fall to the Safari-only route rather than being sent to look for a
  button that is not there. A UA carrying no version token is treated as new
  enough — that is the iPad-claiming-to-be-a-Mac form, which only exists from
  iPadOS 13.
- **Everything else on iOS that cannot install itself** — an in-app browser
  (Instagram, Facebook, Gmail) at any version, and the pre-16.4 browsers
  above. Safari is the only way through, so that is what it says, with a
  button that puts the address on the clipboard so that opening Safari is a
  paste rather than a URL typed from memory. It deliberately does **not**
  navigate: the obvious trick, `x-safari-https:`, means feeding the current
  location into a redirect — a client-side open-redirect shape however narrow
  the intent — and it was only best-effort anyway, since some hosts swallow
  the navigation and nothing reports back. Copying is honest about what it
  did, and no button appears at all where the clipboard is unavailable.
- **Anything else** — the browser menu carries the item under one name or
  another.

**`app/public/sw.js` is an empty service worker,** and exists for exactly one
reason: Chromium only offers `beforeinstallprompt` to a page that has both a
manifest and a service worker with a fetch handler. Its fetch handler is a
pass-through and it caches **nothing**, on purpose — an offline mode would
mean deciding what a stale price or a stale portfolio may look like, and the
data rule here is that a figure on screen is either current or honestly
missing. It is registered only from built output, never in `npm run dev`.

## Data

`app/src/data/demoAdapter.ts` is a clearly-labeled **demo** implementation of
the `DataService` interface (`service.ts`) carrying the prototype's numbers. A
real backend drops in by implementing that interface; no UI changes needed.

**Prices are not among them any more.** `SymbolInfo` is split by provenance:
`quote` (last price, day change, previous close, session high/low/open) is
**real and live**, read per ticker from `/api/quote`; `demo` is what is left
of the prototype's. The split is the point — a call site writes
`x.demo.volume`, which says what the number is at the moment it is rendered,
where a flat `x.volume` sitting next to a real price would not. There is no
price literal left outside `demo`, so a failed quote read has nothing to fall
back to: `quote` is null and every price on screen renders `—` through
`moneyOrDash`. The prototype price survives only for valuing the demo
portfolio, and never as *the* price.

**That bag is nearly empty now.** Market cap and
P/E left for a route of their own (`app/api/stats.ts`, EODHD's delayed US
extended quote), taking with them a forward P/E that was literally `pe * 0.62`
and three string constants — beta `2.14`, dividend yield `0.02%`, short float
`1.1%` — that read identically under every ticker in the app. Forward P/E and
dividend yield are real now; beta and short float had no source on this
subscription and their rows are gone rather than rendered as a dash that would
never resolve. A delayed feed is the right source for figures that move on the
scale of quarters and the wrong one for a price, so that route maps no price at
all — nothing from it can sit beside the header's live one claiming to be the
same instant. The endpoint is US-only, so a Toronto or London symbol renders
those rows as `—`.

**Day change used to be the notable absence, and is not any more.** The
snapshot that once stood in for a price carried no day-change field, so every
percentage beside a real price was a demo figure. The live quote carries one,
so the watchlist rows, the movers ranking (Gainers and Losers alike) and the
stock header all print and sort by the actual session.

**Volume followed it, and took relative volume with it.** The quote carries no
volume, so the "Most active" tab, the Vol column and RVol were prototype
numbers — and RVol was the worst of them, computed as
`1.1 + (ticker.length % 4) * 0.4`, a figure derived from how many letters the
symbol has and printed with an "×" beside a real price. Both now come from
`/api/stats`: the session's cumulative volume and the provider's own average
daily volume, from one snapshot, with RVol as the ratio. It reads low all
morning because the session total is partial — which is what relative volume
means everywhere — and it is `—` rather than `∞×` for a newly listed name
whose average is zero.

**The Movers screen's universe is real now, and the gate is gone.** It used to
rank the ten-row sample table, so it was "the movers among ten sample stocks"
rather than the market's — real figures over a hand-picked universe, which is a
more convincing wrong answer than obvious placeholders are, and the reason the
whole screen sat behind the sample-data switch even after its numbers became
real. `/api/movers?board=gainers|losers|active` ranks the actual US market
through EODHD's screener instead, and both the screen and the home preview read
it with the switch in either position.

**The filters are the feature.** Sorted naively by day change the screener
returns sub-penny OTC listings: a 14% "gain" on a stock quoted at $0.0016
outranks every real move in the market. Three floors, chosen by running the
query and looking at the answer, make the board readable — a $5B market cap, a
$10 price and 2M shares of daily volume. With them the top of the gainers board
is Moderna, Edison International and Duolingo.

**One session behind, and the screen says so.** The screener answers on the
last completed session and its own documentation rules out asking for any
other, so during a trading day this board is yesterday's. The route sends
`lastClose: true` rather than letting the screen assume it, and the screen
carries a line saying the figures are from the last market close. That is also
why the price column is the screener's close rather than the live quote: the
change beside it is that session's, and a live price next to a last-close
change would be two moments under one label. The intraday alternative is the
bulk live endpoint (the whole US market in one request, fifteen minutes
delayed), which is a bigger change and a different cost.

**Sector chips filter the board rather than re-running the query.** The
screener does accept a sector filter, but one filter cannot express "either of
these two", and the app's "Consumer" chip covers the provider's Consumer
Cyclical *and* Consumer Defensive (its "Financials" is the provider's
"Financial Services"). More to the point, a chip that re-ran the query would
show that sector's own top hundred rather than the movers of that sector within
the board being looked at. An ETF, which the provider gives no sector at all,
is on the board and appears under "All" only.

**Where the prices come from.** `app/src/data/quotes.ts` batches a screen's
tickers into one call to `app/api/quote.ts`, which fans out to Finnhub's
`/quote` — one upstream request per symbol, at most 25 per call, six at a
time. Quotes are cached per ticker for 15 seconds and the price screens
re-read every 20 (`useLoadable`'s `refreshMs`, which refreshes silently, keeps
the last good data through a failed poll, and stops while the tab is hidden).
A ticker the provider does not price is simply absent from the map and renders
`—`; a ticker whose fetch failed is named in the response's `unavailable`, so
the two never collapse into one dash. The key is server-side because a
provider key is the account's whole quota in one string.

**Two failure modes the provider has, handled rather than papered over.**
Finnhub answers an unknown symbol with HTTP 200 and every field zeroed, which
a status-code check reads as a real `$0.00` — so a quote with no timestamp or
no price is refused outright (`api/_lib/finnhub.ts`). And a quote with a price
but no previous close has no true day change, so it is refused rather than
printed as `0.00%`, which a reader would act on.

**The charts are real too, from a second provider.**
`app/src/data/priceHistory.ts` reads `/api/candles`, which maps EODHD's daily
bars. What that replaced was a seeded pseudo-random walk
— and not only the line. The candle bodies were derived from the close series
(open was *yesterday's* close, the wicks a fixed ±1.6), the volume pane was
`8 + ((i * 37) % 26)`, a sawtooth that repeated every 26 candles for every
stock in the app, and "RSI" was `50 + (close - ma12) * 3.6`, which is not RSI
by any definition: unbounded, with no notion of gains against losses, and
scaled by the stock's own price, so the 30 and 70 lines drawn across its pane
were decoration. MA, RSI(14) and MACD(12,26,9) are now the actual indicators
on the actual closes, and they start where their window fills rather than
averaging whatever happens to sit at the left edge under a label claiming
fifty sessions.

**The portfolio's value through time is real too, and it was the last thing
here that wasn't.** A manual portfolio now draws its own value on every session
it can be placed on, from `app/src/lib/portfolioSeries.ts` — the shares come
from the user's ledger, the prices from the same `/api/candles` the stock pages
read, and the fold is `buildPositions`, the same function the holdings card and
the portfolio total already run on. Using that function rather than a faster
purpose-built walk is deliberate: the curve's last point and the total printed
above it are then the same arithmetic over the same rows, and cannot drift.

Three rules shape it, and each one is a place where the easy version lies:

- **A day it could not price completely is `null`, not the sum of the legs it
  could.** The line breaks there and the caption names the ticker responsible.
  A total that quietly drops a holding is not a smaller total, it is a wrong
  one — the same rule the portfolio total obeys.
- **A close carries forward at most seven days** (`MAX_CARRY_DAYS`). A position
  really is worth its last traded price on a day its exchange was shut, so
  carrying Friday's close across a weekend states a fact. Carrying a halted or
  delisted ticker's price across a month does not, so past the bound the day is
  reported unpriced instead.
- **The figure beside it is the gap between the two lines, not the value line's
  own endpoints.** Reading first point against last looks like performance and
  is not: it rises when money is paid *in*, so a portfolio that never gained a
  shekel would report a profit the size of the deposit. The gap cannot be moved
  that way, because buying more lifts value and cost together.

The second, dashed line is what those positions cost. It is never gapped, and
the asymmetry is the point: what someone paid is their own arithmetic over
their own rows, and no provider outage can make it unknown.

Only a manual portfolio gets this. A linked account is read through SnapTrade,
which reports no priced history at all, and the seeded walk that remains under
the demo portfolios is labelled as sample data and never drawn beneath a real
figure. `fetchRealDailySeries` exists so this one reader bypasses the
sample-data switch: a seeded walk under share counts the user actually typed
would be invented history of a portfolio that never existed.

**Why two providers, and not one.** Finnhub serves `/quote` on a free key but
keeps `/stock/candle` for its paid tiers, where a free key gets a 403 — so
every chart in the app rendered "this subscription may not include this data",
which was honest and still a dark chart. The bars now come from EODHD's
`/api/eod` instead, on the EOD+Intraday All World Extended subscription this
account already pays for, with the key that was already server-side for
`/api/news`. The quotes deliberately stayed on Finnhub: EODHD's REST quote is
the delayed one that plan advertises — measured 15–19 minutes behind on an
exchange that was open at the time — so moving them would have traded a live
price for a stale one. Two providers is the cost of having both a real chart
and a real price. See `docs/eodhd-plan-decision.md` for what else that
subscription does and does not cover.

**The bars are raw, not adjusted.** EODHD returns `adjusted_close` beside the
close, and the route ignores it. The chart draws candlesticks and the provider
adjusts only the close, so scaling the open, high and low by the adjusted/raw
ratio would put three prices on screen that nobody ever traded at — and that
adjustment folds in dividends besides, which makes the result not a historical
price at all. The honest cost: a split inside the window draws as a cliff,
because that is what the raw price did.

**What this replaced, and why.** Both prices and bars used to come from
**mirrors**: GitHub Actions that fetched once a night and committed static
JSON into the repo, because Alpha Vantage's free key allowed tens of requests
a day and had to stay server-side. Two costs were paid daily for that. Only
the ten tickers listed in `coveredTickers.json` had a chart at all, and when
Alpha Vantage moved `outputsize=full` behind a subscription the price job
stopped publishing anything — no screen could tell that from a quiet market,
and the charts had been dark ever since. A route serves any symbol the reader
opens and cannot silently stop. The screener mirror stays, because it is not a
price feed: it is the Recovery Detector engine's own daily ranking, and what
the app still reads from it is the engine's opinion — the Satellite card's BUY
candidates, a stock's ranking row, and which tickers the engine has a view on.

The route's contract, and the honest states that follow from it:

| What the provider answers | App shows |
| --- | --- |
| a series for the ticker | the real sessions, and the key-stats rows a bar can answer |
| `no_data` for the ticker | "no price history for this symbol" — a fact, not a failure, and not a retry prompt |
| a series whose newest session is over `MAX_SERIES_AGE_DAYS` old | "unavailable" with the age, never the stale sessions |
| 403 or 402, because the key's plan or quota refuses it | "this subscription may not include this data" — never "try again later" |
| unreadable, or any row in it unreadable | "unavailable" — the whole series, because a chart is read as a whole and one with sessions silently dropped is a picture of price action that never happened |

`MAX_SERIES_AGE_DAYS` is 7 where the screener's gate is 4, deliberately.
`as_of` is the last *trading* session, so a Friday close read on the Tuesday
after a Monday holiday is already four days old with nothing wrong. The
asymmetry is also about what the number is for: a stale "last price" is
presented as today's and misleads directly, while a year of real sessions
missing its last few is still an honest year of history.

**1D is a different series, not a narrower slice.** The timeframe row offered
1W, 1M, 3M and 1Y and no 1D for a long time, because a daily series is one
point per session — a day is a single dot, and a 1D drawn from daily bars
could only have been the invented path between yesterday's close and today's.
It reads `/api/intraday?symbol=` now: five-minute bars, one session, from the
same EODHD plan — the shape of a trading day, which a series of one point per
session cannot draw.

**It is the last COMPLETED session, not the running one**, and that is the
feed's limit rather than a choice. Measured on 2026-09-02 against the open US
session, twice — thirty-one minutes in and again two and a half hours in — the
route still answered with the previous session, and the provider probed
directly returned an empty array for every window inside the running day at 5m
and at 1m, for two symbols, while the WebSocket confirmed the market was open
and the stock had moved 2.4% in between. It publishes after the close, not on a
lag. So the tab carries the same line the movers board does, whenever the
session it draws is not today's.

Two details the feed forced, both verified against it rather than read off the
documentation. Five minutes and not one: a session is 79 five-minute bars, a
legible line on a phone, where 1m is 390 points for the same picture at the
same cost. And every session ends with a zero-width bar stamped at 20:00 UTC
whose volume is `null` — the closing print, seen on five sessions across two
symbols and never in an interior bar. It is dropped rather than drawn as five
minutes in which nothing traded; a missing volume anywhere else still
invalidates the series.

The 1D tab is offered only with **sample data off**. Every other window still
draws a generated walk when that switch is on, while the intraday series has no
demo branch at all, so showing both under one row of chips would put a real
session beside an invented month with nothing to tell them apart.

`MDA` is the standing example of the other gap: it trades in Toronto, the
provider has no US tape for it, and both the quote and the chart say so for
that one symbol rather than the whole screen failing.

**The headline and the chart describe different moments, on purpose.** The
header is the live quote — today's session as it stands — while the newest
daily bar is the last *completed* one, so during market hours they legitimately
differ. The OHLC strip is stamped with the session it describes for exactly
that reason. The key-stats grid follows the header rather than the chart for
the four rows the quote actually answers (Open, Prev close, Day range), so it
cannot show yesterday's open under today's price; Volume, Avg vol and RSI(14)
stay on the bars, which are the only source that has them. They all used to be
`price - 1.9`, `price * 0.99`, `price - 3.1` to `price + 2.4` and a frozen
`162.4M` that was the same figure for every stock.

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
| סקירה / Overview | demo adapter + real holdings + `/api/quote` + `/api/candles` + `/api/stats` | real live price and day change, real chart, and a key-stats grid that is real throughout — open, prev close and day range from the quote, volume, avg vol and RSI from the bars, market cap, P/E, forward P/E, dividend yield and the 52-week range from the stats route (US listings; `—` elsewhere). Analyst ratings are still demo |
| דוחות / Reports | `/api/stock/{ticker}/fundamentals` (live, un-mirrored) | branches purely on the engine's `status` |
| חדשות / News | `/api/news` (this repo's Vercel function) | excerpts only, never a full article body |

The engine's view of a ticker is a **card, not a header field**, because most
symbols are not in a 100-name ranking: `fetchRankingRow` resolves `ok(null)`
for a healthy snapshot that simply does not cover this stock, which renders
as "not covered today" with no retry — deliberately not `unavailable`, since
nothing failed and there is nothing to retry. Day-change percent is **not**
in the ranking payload, so it is not shown there rather than being borrowed
from demo data — and the header beside it no longer needs to: it prints the
quote's own day change.

The mirror readers that remain — the Satellite card's BUY list, a single
stock's ranking row, and the list of tickers the engine has a view on — share one
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
| Every price on screen (`SymbolInfo.quote`) | `/api/quote?symbols=` — live, batched per screen | 1 Finnhub call per symbol, shared for 20s |
| Stock page · chart, and the movers' sparklines | `/api/candles?symbol=` — live, per ticker | 1 EODHD call per ticker, cached an hour at the edge |
| Stock page · chart, 1D tab | `/api/intraday?symbol=` — 5-minute bars, the last completed session | 5 credits per ticker, cached an hour at the edge and in the client |
| Movers screen · one board | `/api/movers?board=` — EODHD's screener over the US market | 5 credits per board, cached 30 min at the edge and in the client |
| Home · movers preview | the same two boards (gainers + losers), merged | none beyond the above — the reads are shared |

**Route tests live in `app/api/_tests/`, and that is not a style choice.**
Vercel turns every `.ts` file under `api/` into its own Serverless Function,
test files included, and the Hobby plan allows twelve per deployment — so the
suites sitting beside their routes counted each route twice and a seventh route
failed the deploy at `exceeded_serverless_functions_per_deployment` with a
build that had succeeded. A leading underscore is Vercel's own convention for a
path under `api/` that is not an endpoint (the same reason `api/_lib/` has
never deployed), and both `npm test` and `npm run typecheck:api` still reach
them. A new route's tests belong there too.

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
Preview, and Development so PR previews and local `vercel dev` also work.
`EODHD_API_KEY`, `ALPHAVANTAGE_API_KEY` and `FINNHUB_API_KEY` are required;
`GOOGLE_TRANSLATE_API_KEY` is optional and only changes the language of the
news:

| Variable | Used by |
| --- | --- |
| `EODHD_API_KEY` | `/api/news` (the news feed), `/api/candles` (daily bars — every chart and sparkline), `/api/intraday` (the chart's 1D tab), `/api/movers` (the market-movers boards) and `/api/stats` (market cap, P/E, volume, the 52-week range). **Required for every chart and for the movers screen.** A plan refusal comes back as 402/403 and is reported as a plan problem rather than as an outage. |
| `GOOGLE_TRANSLATE_API_KEY` | `/api/news?lang=he` — Hebrew headlines, via the Cloud Translation API. **Optional**: without it the news is served in the provider's English rather than failing. The key travels as the API's `key=` query parameter, so restrict it **to the Cloud Translation API** in the Google Cloud console — an HTTP-referrer restriction would break it, since the call is server-side. The first 500k characters a month are free, but the project still needs billing enabled. |
| `ALPHAVANTAGE_API_KEY` | `/api/earnings` — the calendar and per-stock history. |
| `FINNHUB_API_KEY` | `/api/quote` — the last price and day change on every screen, and nothing else. **Required for prices.** A free key covers quotes; its historical candles are a paid tier, which is why the charts moved to EODHD. |

All four are read **only on the server** — every one of them is used inside a
function under `api/`, and no client code ever reads them. That is why none may
be given a `VITE_` prefix: Vite inlines any `VITE_`-prefixed variable into the
client bundle, which would publish the key to every visitor.

Pure request/response mapping lives in `app/api/_lib/news.ts` (unit-tested in
`news.test.ts`) so it doesn't require mocking global `fetch` or a Vercel
request/response pair to test. The `api/` directory has its own
`tsconfig.json` (`npm run typecheck:api`) since it's excluded from the main
app's `src`-scoped one and isn't bundled into the client build.

## Connected accounts (SnapTrade Commercial, read-only)

**A third live surface: each reader links their own brokerage.**
`app/api/snaptrade.ts` reads a reader's real accounts — balances and
positions, read-only — through [SnapTrade's](https://docs.snaptrade.com)
**Commercial** tier, and issues the Connection Portal link they use to link
one in the first place.

**It began as a single-account founder demo on the Personal tier**, where the
key *was* the identity: one fixed account, visible to everyone who opened the
app, with no `userId` or `userSecret` in any request. That is gone. Commercial
identifies the user in the query, which is what makes per-reader linking
possible at all (see
[Personal vs Commercial](https://docs.snaptrade.com/docs/personal-vs-commercial)
and [Authentication methods](https://docs.snaptrade.com/docs/authentication-methods)).

**The secret is the whole design.** SnapTrade generates a `userSecret` when a
reader is registered and never returns it again — `resetUserSecret` needs the
current one to rotate it. So it lives in `public.snaptrade_users`
(`supabase/migrations/0007_snaptrade_users.sql`), a table with RLS enabled and
**no policies at all**, plus the grants revoked: closed to the browser's
`anon` and `authenticated` roles by two independent mechanisms, readable only
by the service role the API route holds. Two consequences are in the code
rather than left to care:

- **A registration whose secret cannot be stored is undone.** The route
  registers, writes, and on a failed write deletes the SnapTrade user it just
  created — otherwise the secret exists nowhere and the user is unreachable
  forever. A test asserts the undo.
- **Account deletion removes the SnapTrade user first.** The `on delete
  cascade` on that table destroys the only credential that reaches the
  connection, so `api/delete-account.ts` unlinks before it deletes, and
  **refuses to delete the account** if the unlink fails. A retry is
  recoverable; a live brokerage connection nobody can ever remove is not.

**Who is asking comes from a verified token, never from the request.** Every
method authenticates the caller through `/auth/v1/user` (a local JWT decode
would happily read the claims out of a forged token) and looks their SnapTrade
credentials up by that verified id. The only value taken from the request at
all is the connection id to remove, and that is checked against the caller's
own connections first. Tests pin it: a request naming someone else's `userId`
and `userSecret` in the query still reads only the caller's account.

**Three methods, one route.** Vercel turns every file under `api/` into its own
Serverless Function and the plan allows twelve (see `api/_tests/README.md`),
so these live on one route split by method — which is the right axis anyway,
since all three are the same resource:

| | |
| --- | --- |
| `GET /api/snaptrade` | the caller's accounts, balances and positions |
| `POST /api/snaptrade` | a Connection Portal URL, registering the caller if this is their first link |
| `DELETE /api/snaptrade?connectionId=…` | remove one of their connections |

**Responses are `private, no-store`.** This is one person's money; the shared
edge cache the single-account demo used would now be a cross-user leak.

**The portal asks for `read`.** `connectionType: 'read'` is set explicitly in
`connectBody()` rather than relying on SnapTrade's default, because a default
is a thing that changes and this is the one point where a *trading* connection
could be requested by accident. A test asserts the body carries it. The portal
renders in English — SnapTrade ships `en` and `pt-BR` only — and the UI says so
before sending anyone there rather than letting a Hebrew-first reader discover
it on arrival. Its URL expires five minutes after it is issued, so it is
fetched when the button is pressed, never prepared in advance.

**Read-only, structurally.** The function can reach exactly eight upstream
paths, listed in one `PATHS` constant. Five are `GET` reads: `/accounts`,
`/accounts/{id}/balances`, `/accounts/{id}/positions/all`, `/authorizations`
and `/authorizations/{id}/accounts`. Three are not reads, because linking an
account is not one: `POST /snapTrade/registerUser`, `POST /snapTrade/login`
and `DELETE /connection/{id}`. Ids come from SnapTrade's own responses or from
the app's own database, never from the caller, so no request to
`/api/snaptrade` can steer it at another path. SnapTrade's trading endpoints
appear nowhere in the codebase, and a unit test asserts that no upstream path
ever matches a trading route.

**Why two account routes.** `/accounts` is documented as *daily* data —
"cached and refreshed once a day" — so a brokerage connected today
legitimately answers an empty list there while the connection is live and
active in SnapTrade's dashboard. When that happens the function walks
`/authorizations` and asks each connection directly, which is the real-time
route. `source` in the response says which one answered, and the demo screen
shows it along with SnapTrade's own `data_freshness.as_of`, so the freshness
of what is on screen is stated rather than implied.

**Read `data_freshness_mode`; do not infer it from the plan.** The spec says
manual refresh "is disabled for Real-time plans (Personal and Pay as you go)
**unless the connection is delayed**… Refer to the `data_freshness_mode` field
on a connection to determine this." It is tempting to read that as "Personal is
real-time, therefore refresh never applies" — and that is wrong. The mode is a
property of the *connection*, not the plan, and is `delayed` when the
brokerage forces it. The real IBKR connection here reports **`delayed`**: its
data comes from a cache, and manual refresh does apply to it.

The route still never issues that `POST`: a refresh is billed per call, so it
is not something a screen should be able to trigger. Refresh lives in
`app/scripts/snaptrade-refresh.mjs`, an operator script run by hand with the
credentials in the environment. It lists connections and stops unless given
`--refresh`, because SnapTrade bills per refresh call. It imports the signing
helpers from `api/_lib/snaptrade.ts` rather than copying them, so it cannot
drift from what the route sends.

**Three empty states, not one.** How an empty answer should be read depends on
that same field: on a `realtime` connection it is the brokerage's current
answer, while on a `delayed` one it may just be a cache that was never filled.
The screen says which. And an empty list is a different fact again from having
no connection at all:

| What SnapTrade reports | What the screen says |
| --- | --- |
| no connections | "עדיין לא מקושר חשבון ברוקר" — nothing has been linked in the portal |
| a live connection, zero accounts | names the brokerage and says it is connected but reporting no accounts, with the connection's state (read/trade, realtime/delayed) |
| a **disabled** connection | says so, and shows none of its figures — see below |
| accounts | the real balances and positions |

**A disabled connection is never served.** SnapTrade's docs are explicit that a
disabled connection "can no longer access the latest data from the brokerage,
but will continue to return the last available cached state" — it answers 200
with holdings of entirely unknown age. So the route lists `/authorizations`
first, on every request, and excludes any disabled connection from account
discovery: its balances and positions are never even requested. The connection
is still reported, so the screen says the connection is dead rather than
implying nothing was ever linked. Showing those cached figures would be the
same lie as serving a stale screener snapshot, except denominated in money.
A connection whose `disabled` flag is absent is treated as live — the field is
documented and normally present, and hiding a real account over one missing
boolean would be its own dishonesty.

The middle row is the state a freshly linked Interactive Brokers connection
sat in during development, on a real, funded, actively traded account — so it
is worth recording why, because the obvious guesses are wrong.

**SnapTrade does not reach IBKR over a live API.** Per SnapTrade's own
integration page it uses an **IBKR Flex Query**: the account holder enables
SnapTrade under IBKR's *Performance & Reports → Third-Party Reports*, and
hands SnapTrade a Query ID and Token. That is a scheduled report feed, not a
request-time call. So a connection can be genuinely Active — the token is
valid — while no report has been delivered yet, and the account list is
legitimately empty. Delta, another SnapTrade-based app, documents a 24–48 hour
wait before data appears when the service is first enabled; SnapTrade's own
page does not state a figure.

That is also why the real-time/delayed distinction above does not rescue it:
`data_freshness_mode: realtime` describes how SnapTrade answers, not how fast
IBKR's report feed starts.

Reporting this as "nothing connected" sent us hunting for a connection that
already existed, which is why the response now carries the connection list
(states and counts only; nothing identifying). Nothing in this repo can
resolve it — the app's job is to say precisely which state it is in. SnapTrade's trading endpoints
appear nowhere in the codebase, and a unit test asserts that no upstream path
ever matches a trading route.

**One switch decides whether the money is real.** Sample data (More → נתוני
דמו) is it. **On**, every account in the app is the demo adapter's — three
invented brokers, the fabricated holdings table, the seeded performance walk.
**Off**, `app/src/data/appService.ts` reads the reader's own connected
accounts instead, and the Connections screen offers the link. There used to be
a second switch (`DEMO_FLAGS.liveAccount`) that pointed the app at the founder's
one real account while sample data stayed on; it is gone, because it made
"is this money real" depend on two switches and left a reader who turned sample
data off still looking at demo brokers.

**Where invented numbers were removed rather than shown over real ones.** Two
demo-derived visuals cannot honestly sit above a real account, so with the
switch on they are replaced by a statement of what is known, not redrawn:

| Surface | With sample data off |
| --- | --- |
| Home hero + Portfolio day change and performance chart | Replaced by an explicit "no performance history" note — SnapTrade reports no day change or priced history for a linked account. A *manual* portfolio is the exception and draws a real value curve from its own ledger (see above) |
| Portfolio allocation donut | Computed from the account's **real** position values; positions the brokerage did not price are excluded, and if none are priced the card says so |
| Any unreported field | Renders `—`. `null` is never coerced to `0`, and a total is never summed from partially-priced positions — if the total cannot be determined the account reports `unavailable` with that reason |
| Open P&L | SnapTrade's position schema carries no such field. It is derived as `units × (price − cost_basis)` from three numbers the brokerage did report, and is `—` the moment any of them is missing — never estimated |
| Return % | `openPnl / **abs**(units × avgCost)` — see below |
| Day change on a connected account | `—`, not `+0.00%`. The brokerage reports no day change, and a green zero states a return we do not have |
| A short position in the allocation ring | Excluded and **named**. A short is a negative holding with no share of a total; dropping it silently made a two-position account read as "ORCL 100%" |

**The short-position sign bug, recorded because only real data found it.** The
first live payload contained a short: 77 shares of ALB at −$10,454. Every test
fixture until then had been long. `units` is negative for a short, so
`units × avgCost` is negative, and the return `openPnl / basis` came out
**positive** — a position down $480.67 rendered as **+4.82%, in green**. The
fix is one shared `positionReturnPct()` in `lib/format.ts` taking the
magnitude of the basis and the sign from the P&L alone; both the portfolio
list and the connected-account screen call it, so they cannot drift.
`lib/positionReturn.test.ts` pins it with the real numbers.

**One shape worth knowing about, because getting it wrong is silent.**
`/accounts/{id}/positions/all` answers an *object* —
`{ results: [...], data_freshness: { as_of } }` — not a bare array. Reading it
as an array yields zero positions with no error at all, which would render a
real account full of holdings as "no positions": invented emptiness presented
as fact. An envelope the function cannot read is reported as `bad_response`
instead, and a test guards it. The same rule covers the account list: rows
present but none mappable is a `bad_response`, not an account-less user.

Same honesty contract as the screener mirror and `/api/news` — and the same
machinery: the route's transport is the shared `_lib/upstream.ts`
`fetchUpstreamJson()`, so its timeout budget, abort wiring and failure
taxonomy (`upstream_unauthorized`, `upstream_forbidden`,
`upstream_rate_limited`, `upstream_timeout`, `bad_response`) are the ones
`/api/news` and `/api/earnings` already answer with, rather than a third
hand-rolled copy that could drift. SnapTrade authenticates with a `Signature`
header instead of a query parameter, and two of its paths are not `GET`, which
is what that helper gained to serve this route: an optional `headers`
argument and an optional `{ method, body }` — so the timeout-through-body-read
and the failure classification stay in one place rather than being copied. Any failure —
network, timeout, non-2xx, unparseable or unexpected-shape body — surfaces as
the honest "unavailable" state **with a specific reason** ("Sign in to see your connected
brokerage accounts", "SnapTrade did not answer in time"), and never falls
back to the demo adapter's numbers. **Zero connected accounts is a success,
not an error**: before a brokerage is linked the call legitimately returns
`ok([])` and the screen says "עדיין לא מקושר חשבון ברוקר" — it never invents a
holding to fill the space.

### One-time setup

**Required environment variables** — `SNAPTRADE_CLIENT_ID` and
`SNAPTRADE_CONSUMER_KEY` (the Commercial pair; the old
`SNAPTRADE_PERSONAL_*` names are retired), plus `SUPABASE_SERVICE_ROLE_KEY`,
which the route needs to read the per-user secret. All three go in the Vercel
dashboard under **Project → Settings → Environment Variables**, scoped to
Production, Preview and Development so PR previews and local `vercel dev` work
too. All are read only server-side (`process.env.…`) and none may ever be given
a `VITE_` prefix, which would bundle the secret into the client build. The
consumer key is used only as an HMAC key and never appears in a URL or a
response body.

**Run `supabase/migrations/0007_snaptrade_users.sql`** before deploying: with
no table, every connect attempt answers an honest configuration error.

Then, in the app: More → turn **off** נתוני דמו, then **עוד → חיבורי ברוקר →
לחבר חשבון ברוקר**. That opens SnapTrade's portal, the reader signs in to
their broker there, and the portal returns them to the app. Shift never sees
the broker password.

**A brokerage may take a day or two to report.** See the Interactive Brokers
note above — a connection can be genuinely active while no data has arrived
yet, and the screen says which state it is in rather than implying nothing was
linked.

Request signing lives in `app/api/_lib/snaptrade.ts` (unit-tested in
`snaptrade.test.ts`, handler behaviour in `snaptradeHandler.test.ts`), split
from the handler for the same reason `_lib/news.ts` is: the canonical-JSON
signature rule and the defensive upstream field mapping are testable without a
request/response pair or a mocked `fetch`.

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
