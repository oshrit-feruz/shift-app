# EODHD plan: what it covers, and how the app could use it

Decision document, 2026-09-02. No application code was changed for this;
the point is to settle facts before choosing what to build.

Account: `pixelize.app@gmail.com`, plan **EOD+Intraday — All World Extended**
($29.99/mo), `subscriptionMode: paid`, `dailyRateLimit: 100000`,
`extraLimit: 430` (re-verified this session via `get_user_details`).

Evidence hierarchy used throughout: a tool call that returned real data is
proof; an HTTP 403 is proof of the opposite; documentation is weaker than
either and is quoted only where no probe was possible.

## 1. Entitlement table

| Capability | Included | Evidence | If not included |
|---|---|---|---|
| Daily OHLCV incl. volume, any exchange | **Yes** | `get_historical_stock_prices` QCOM.US monthly bars from **1991-12-13** (IPO); MDA.TO daily bars 2026-08-26..09-01 with volume | — |
| Daily history depth (US large cap) | Full | QCOM back to its 1991 listing; docs: "from inception for most US symbols", international from 2000 | — |
| Live REST quote (`/real-time`) | **Yes, delayed** | `get_live_price_data` returned QCOM/AAPL/TSLA/MDA.TO/VOD.LSE/SHOP.TO. **Measured lag on London during its session: 15–19 min** (section 2) | Real-time REST is not sold self-serve; real-time is the WebSocket |
| US extended quote (bid/ask, 52w hi/lo, **market cap, P/E, forward P/E**, div yield, avg volume, 50/200-day averages) | **Yes** (US only) | `get_us_live_extended_quotes` QCOM.US: marketCap 174.75B, pe 19.48, forwardPE 16.84, fiftyTwoWeekHigh 259.92, averageVolume 15.6M, dividendYield 2.16% | Pricing page as fetched shows ✗ on this plan; the plan doc bundled with the MCP says Yes; the probe returned 200. **Probe wins.** |
| Intraday history 1m | **Yes**, US only | QCOM.US 1m bars for 2026-09-01 (incl. after-hours to 23:59 UTC) and for 2020-01-06 (deeper than the documented 120-day range). MDA.TO 1m → `[]` | — |
| Intraday history 5m | **Yes**, US and non-US | QCOM.US 5m for 2025-01-06; MDA.TO 5m for 2026-09-01. MDA.TO 5m for 2021-03 → `[]` | — |
| Intraday history 1h | **Yes** for recent; depth inconclusive | QCOM.US and MDA.TO 1h for 2026-08-31..09-01 ok; QCOM.US 1h for 2010, 2015, 2020 → `[]` (docs claim 7200 days; could not confirm) | — |
| Technical API (SMA/EMA/RSI/MACD/avgvol…) | **Yes** | `get_technical_indicators` AAPL.US avgvol(50) = 55,182,240 | — (the app computes its own from bars anyway) |
| WebSocket `us_trades` | **Yes** | `{"status_code":200,"message":"Authorized"}` + trades for QCOM/AAPL/TSLA at 09:29 UTC (`ms: "extended-hours"`) | Pricing page as fetched shows ✗ on this plan; probe says yes. **Probe wins.** |
| WebSocket `us_quotes` (bid/ask) | **Yes** | Authorized + QCOM/AAPL quotes | — |
| WebSocket `forex` | **Yes** | Authorized + EURUSD ticks | — |
| WebSocket `crypto` | **Yes** | Authorized + BTC-USD ticks | — |
| WebSocket non-US equities | **No** | VOD.LSE/BP.LSE/HSBA.LSE subscribed on the `us` feed **during London's open session**, 10 s → no messages (only a stale VOD ADR print). MDA.TO/SHOP.TO → none. Docs: US stocks, forex, crypto only | Not sold by EODHD at all (Deutsche Börse marketplace feed aside) |
| WebSocket limits | — | Docs: **one connection per endpoint per API key**, **50 symbols per connection**, HTTP 403 on extra connections, IEX tape only for US trades, extended hours 04:00–20:00 ET, no API-call cost | 50-symbol cap is upgradeable via dashboard (price not shown) |
| Historical dividends (amount, ex/record/pay dates) | **Yes** | `get_historical_dividends` QCOM.US: 11 quarterly rows 2024-02..2026-09, incl. declaration/record/payment dates | — |
| Splits | Yes (doc) | Plan doc "Splits and Dividends: Yes"; not probed | — |
| News feed (per ticker and market-wide, with sentiment) | **Yes** | `get_company_news` QCOM.US returned articles with `sentiment`; **production `/api/news` already serves it** | Pricing page lists News as a separate add-on; probe and production say included. **Probe wins.** |
| Sentiment API | **Yes** | `get_sentiment_data` QCOM.US, 4 daily rows | — |
| Symbol search | **Yes** | "MDA Space" → `MDA.US` (USD OTC listing, ISIN CA55293N1096) | — |
| Exchange hours / holidays | **Yes** | `get_exchange_details` US, LSE | — |
| **Fundamentals** (financials, EPS, **analyst ratings**, beta, short interest, market cap/P/E for non-US) | **No** | `get_fundamentals_data` QCOM.US → **403 Forbidden**. Plan doc: "Fundamental Data: No" | Fundamentals Data Feed **$59.99/mo** (its doc says it also includes the Calendar API and News), or All-In-One **$99.99/mo** |
| **Earnings calendar** (upcoming/past, estimates, actuals) | **No** | `get_upcoming_earnings` QCOM.US → **403 Forbidden**. Plan doc: "Financial Events (Calendar) API: No" | Calendar Feed **$19.99/mo**, or inside Fundamentals / All-In-One |
| Economic events, macro, insider transactions, logos | No (doc) | Plan doc; not probed | Fundamentals / All-In-One |
| US tick data, options, bulk fundamentals, marketplace datasets | No (doc) | Plan doc; not probed | All-In-One ($99.99) for ticks; options and marketplace are separately priced (price not on the pricing page) |

Add-on arithmetic. Extended ($29.99) + Fundamentals ($59.99) = $89.98, and
All-In-One is $99.99 and includes both plus Calendar, ticks and priority
support. Whether two self-serve plans can be stacked on one API key was not
verified; EODHD's own structure points to upgrading to All-In-One as the
path. Net cost of "everything": **+$70/mo**. Net cost of just the earnings
calendar, if stacking is allowed: **+$19.99/mo**.

API-call budget (from the rate-limit doc): EOD, dividends, live quote, US
extended quote = 1 call per symbol; intraday and technical = 5 per request;
news = 5 + 5 per ticker; fundamentals would be 10. 1,000 requests/minute.
Today's usage counter: 9 calls before this session. 100,000/day is not a
constraint for this app at any plausible traffic.

Where the sources disagree. The pricing page, as rendered by the fetch tool,
marks WebSockets, the US extended quote and the news feed as **not** included
on this plan; the plan document shipped with the MCP marks all three as
included; live probes returned real data for all three. The fetched matrix
is most likely a column-alignment artifact of the page's HTML, but it was not
possible to confirm that visually. Treat the probes as the truth and keep the
pricing page in mind only if EODHD ever tightens enforcement.

## 2. The REST live-quote delay, measured

**US regular hours could not be measured in this session** (probes ran
09:28–09:36 UTC; the US session opens 13:30 UTC). A wake-up is scheduled for
13:50 UTC today to repeat the measurement and append a section below.

What was measured instead:

**Out of hours, US.** At 09:29 UTC the REST quote for QCOM.US carried
`timestamp 1788294300` = **2026-09-01 20:25 UTC**, price 166.61 (the official
close). At the same instant the WebSocket delivered pre-market trades stamped
09:25 UTC at **165.25**. The US extended quote's `lastTradeTime` was likewise
20:25 UTC of the previous day. Conclusion: the REST quote does not cover
pre-market or after-hours at all (the endpoint doc says the same: "only works
during trading hours; for pre-market and after-hours use the WebSocket").

**During a live session, London and Xetra** (LSE open 07:00–15:30 UTC,
`isOpen: true` at the time):

| Wall clock (UTC) | Symbol | Quote timestamp | Lag |
|---|---|---|---|
| ~09:29:10 | VOD.LSE | 09:10:00 | ~19 min |
| 09:31:24 | VOD.LSE | 09:16:00 | 15 min 24 s |
| 09:32:53 | VOD.LSE | 09:16:00 | 16 min 53 s |
| 09:32:53 | BP.LSE, HSBA.LSE | 09:17:00 | 15 min 53 s |
| 09:32:53 | SAP.XETRA | 09:15:00 | 17 min 53 s |

The timestamp advances in one-minute steps behind a roughly 15-minute wall.
That matches the plan's own label ("Live Data (15min Delayed) API"). Nothing
observed suggests the US feed behaves differently, but the US number is the
one that matters and will be appended when measured.

Consequence, pending the US number: EODHD's REST quote is **not** a
replacement for the current Finnhub `/quote`, which the app treats as
real-time. The WebSocket is the only real-time price EODHD sells on this plan.

## 3. The audit, corrected against `main` (e4a269a)

Stale lines are marked. Checked against the code, not the earlier summary.

### Believed available — verdicts

1. **Charts and sparklines** — correct. Production `/api/candles?symbol=QCOM`
   answers `502 {"error":"upstream_forbidden","upstreamStatus":403}` today
   (Finnhub `/stock/candle` is paid). `app/src/data/priceHistory.ts` renders
   that as "this subscription may not include this data". EODHD's `/eod`
   endpoint supplies exactly the `d/o/h/l/c/v` rows the route already emits.
2. **RSI, MACD, moving averages** — correct. `app/src/components/charts.ts`
   computes them from bars; `Stock.tsx` passes `showRSI/showMACD/showMA`.
   They light up with item 1, no further work.
3. **Average volume** — correct. `ADV_STATS` in `Stock.tsx` averages
   `bars[].volume`; the "Volume" row reads the newest bar. Both come with 1.
4. **52-week high for any ticker** — correct, and cheaper than stated: the
   candles route already fetches 400 calendar days, so the 52-week high/low is
   a `Math.max` over the bars the chart already has (no extra call). For US
   names the extended quote also carries `fiftyTwoWeekHigh/Low`. Today it
   comes only from the screener mirror (`SatelliteSignal.high52w`) via
   `EngineCard`.
5. **Volume column, RVol, "Most active"** — correct as far as it goes.
   `Movers.tsx` sorts "Most active" on `x.demo.volume` and prints the same
   string in the Vol column. Real sources on this plan: yesterday's volume
   and the average from daily bars (item 1); **today's running volume** from
   the REST live quote's `volume` field (15-min delayed) or the US extended
   quote. RVol = today's volume / average volume.
6. **The Movers screen gate** — correct that the gate (`useDemoMode()` at the
   top of `MoversScreen`) exists because of volume. **Missing nuance:** the
   screen ranks `demoService.symbols()`, which is the ten-row sample table
   (`SYMS` in `demoAdapter.ts`), so even with real volume it is "movers among
   ten sample symbols", not market movers. Making the tab real needs a real
   universe too: the screener's 100 ranked names (already mirrored), or
   EODHD's Screener API (included on this plan, not probed).
7. **Portfolio performance chart** — correct, and feasible on this plan.
   `PerformanceSlot` in `Portfolio.tsx` returns `t('pf.noReturnHistory')` for
   manual portfolios; `lib/positions.ts` already folds the ledger. Daily bars
   per held ticker, times shares held on each date, gives market value per
   day. Honesty rules for it: a day on which any held leg has no bar is a gap
   (null), never interpolated; the line is "market value of holdings", not
   total return, unless dividends and realised P/L are folded in explicitly;
   the demo `demoService.series(...)` walk stays demo-only.
8. **Non-US symbols** — **partly stale.** Production `/api/quote?symbols=MDA`
   returns a price today (28.37 USD, `asOf 2026-09-01T20:00Z`): Finnhub
   prices MDA's **US OTC listing**, not Toronto. EODHD has both: `MDA.US`
   (28.37 USD) and `MDA.TO` (39.48 CAD, daily + 5m/1h intraday). So the
   question is not coverage but **which listing and which currency**. The
   app's ticker namespace is bare ("MDA"); the news lib already defaults bare
   tickers to `.US` (`resolveSymbol`), and the DB check constraint and
   `isValidTicker` both allow a dot, so `MDA.TO` is representable today. A
   CAD price inside a USD/ILS portfolio total is a mixed-currency total, which
   the honesty contract says must become `null` unless the FX conversion is
   real (EODHD forex EOD/live is included, so it can be, but that is scope).
9. **Tick-by-tick via WebSocket** — see section 4.

### Believed NOT on this plan — verdicts

10. **Market cap and P/E** — **wrong for US stocks.** The US extended quote
    endpoint (included; probed) carries `marketCap`, `pe`, `forwardPE`,
    `dividendYield`, `averageVolume`, 52-week range and 50/200-day averages,
    1 call per symbol. That replaces `x.demo.marketCap` and `x.demo.pe` in
    `Stock.tsx`, and two figures the audit did not list that are worse than
    demo: **"Fwd P/E" is computed as `pe * 0.62`** and **Beta, Div yield and
    Short float are string literals** (`'2.14'`, `'0.02%'`, `'1.1%'`) in
    `ADV_STATS`. Forward P/E and dividend yield become real with this
    endpoint; beta and short float need Fundamentals ($59.99) and should
    render `—` until then. Non-US names: Fundamentals or `—`.
11. **Analyst ratings** — correct. Not on this plan (403); the card is
    literals (31/11/8/3) behind the demo switch. Fundamentals $59.99 or
    All-In-One $99.99.
12. **News** — **stale.** Already real since commit `af8e4e3` (2026-08-27):
    `app/api/news.ts` proxies EODHD with the server-side `EODHD_API_KEY`
    (confirmed set in production: `/api/news?ticker=QCOM` returns articles),
    `screens/news/LiveFeed.tsx` and `screens/stock/NewsTab.tsx` read it, with
    Hebrew translation. The hardcoded `NEWS` array in `demoAdapter.ts` is now
    dead code (no caller outside the adapter). The same key already exists in
    Vercel, so **no EODHD option below needs a new key**.
13. **Earnings calendar** — **stale.** Already real via Alpha Vantage
    (`app/api/earnings.ts`, `ALPHAVANTAGE_API_KEY`; production returns this
    week's rows). Its limits are honest and documented in the route: upcoming
    reports only on the market-wide feed, a free key's tens of requests a
    day, six-hour edge cache. EODHD's Calendar API is **not** on this plan
    (403). Switching would cost $19.99/mo and would add actuals/surprises for
    past reports and remove the daily cap; the route comment already says the
    swap is "this file and its adapter".
14. **Historical dividends** — correct that the app types them by hand; wrong
    that it needs an add-on. Included (probed, with amounts and dates). The
    honest shape is a *suggestion* the user confirms (shares held on ex-date
    × amount), never a row inserted into the ledger unasked.

### Not a data problem — agreed

Allocation for manual portfolios (gated on `demo` rather than on holdings in
`Portfolio.tsx`), notifications, long-term savings, "portfolio today", and
connected accounts are unchanged by any of the above.

## 4. The WebSocket, honestly

Facts that shape the design (all from the WebSocket doc, limits confirmed by
the 403 table there):

- **One connection per endpoint per API key.** A second connection is
  refused with HTTP 403. This rules out the tempting shortcut of opening the
  socket inside a Vercel function per request: two concurrent invocations
  would collide, and so would this MCP session's own probes.
- **50 symbols per connection** (upgradeable, price not published). That is
  the watched universe, not "every ticker".
- US trades are the **IEX tape only**; fine for a last price, partial for
  volume.
- Extended hours 04:00–20:00 ET; no API-call cost; subscriptions are lost on
  reconnect and must be re-sent.

What it would take: one always-on Node process (Fly.io shared-cpu ~$2–5/mo,
Railway ~$5/mo, Render Starter $7/mo; Render's free tier sleeps and is what
already makes the screener slow) that holds the `us` connection, subscribes
to the union of watched symbols, and fans out. Fan-out choices: (a) the
worker exposes its own WebSocket to browsers behind an auth check (the API
key never leaves it), or (b) it publishes to Supabase Realtime broadcast and
browsers subscribe with the anon key. (b) needs throttling: 50 symbols at one
message per second for a 6.5-hour session is ~1.2M messages a day, well past
the free tier's 2M a month, so publish at most once every few seconds per
symbol and only on change. Either way: a reconnect loop, a symbol-set
reconciler against watchlists, health checks, and a fallback to the REST
price when the worker is down that the UI labels as delayed.

Whether it is needed depends on the US REST measurement pending at 13:50
UTC. If REST is ~15 min behind (as London suggests), the WebSocket is the only
real-time price on this plan; but the app already has a real-time-class last
price from Finnhub's free `/quote`, so the WebSocket buys pre/post-market
prices and tick updates, not a first real-time price. That is a product call,
not a data gap.

## 5. Options, ordered by impact per unit of effort

Effort: S = a few hours, M = a day or two, L = several days plus operations.
Every option keeps the honesty contract: nothing below approximates a number
it cannot fetch.

1. **Daily bars from EODHD** (S, highest impact). Point `app/api/candles.ts`
   at `https://eodhd.com/api/eod/{SYMBOL}.US?from&to&fmt=json` through a new
   `app/api/_lib/eodhd.ts` mapper; keep the response shape so
   `priceHistory.ts`, `CandleChart`, `TickerSparkline` and the tests need no
   change beyond the `source` string. Unlocks audit items 1–4 (every chart,
   sparkline, RSI/MACD/MA, average volume, 52-week high from bars) for any
   ticker EODHD carries. Key: `EODHD_API_KEY`, already in Vercel. Infra: none.
   Still unavailable after: 1D/1W intraday, market cap/P/E (still demo),
   analyst ratings.
2. **Real key stats for US stocks** (S–M). New route
   `app/api/stats.ts` over `/us-quote-delayed` (1 call/symbol, cache 5–15
   min); a `data/stats.ts` reader; `Stock.tsx` reads market cap, P/E, forward
   P/E, dividend yield, average volume and 52-week range from it and renders
   `—` for beta and short float. Retires `x.demo.marketCap/pe`, the invented
   `pe * 0.62`, and three literals. Non-US and ETFs stay `—`. Unlocks item 10.
3. **Volume, RVol and "Most active"** (M, needs 1 and 2). Today's volume from
   the extended quote (delayed), average from bars or the extended quote's
   `averageVolume`; RVol is the ratio. `Movers.tsx` and `Home.tsx`
   `MoversPreview` stop reading `x.demo.volume`; the `useDemoMode` gate on
   Movers can lift **only if** the universe also becomes real (screener's 100
   names, or EODHD's screener API), otherwise it stays a labelled sample
   screen with real numbers. Unlocks items 5–6.
4. **Portfolio value over time** (M–L, needs 1). One bar series per held
   ticker (already cached 5 min), a date-indexed fold in `lib/positions.ts`,
   and a real line in `PerformanceSlot` for manual portfolios; SPY from the
   same route as the benchmark if wanted. Gaps stay gaps; label it "value of
   holdings". Unlocks item 7.
5. **Intraday 1D / 1W timeframes** (M, independent). New
   `app/api/intraday.ts` over `/intraday/{SYMBOL}?interval=5m` (5 calls per
   request, so cache at the edge for ~5 min) and a time-axis mode in
   `CandleChart`. US: 1m/5m; non-US: 5m/1h. Adds the `1D` the timeframe row
   deliberately omits today.
6. **Dividend suggestions in the ledger** (M, independent). New
   `app/api/dividends.ts` over `/div/{SYMBOL}`; in `TxSheet`, offer "QCOM
   paid 0.92 on 2026-09-24 for the 10 shares you held on 2026-09-03: record
   it?" The user confirms; nothing is written unasked. Unlocks item 14.
7. **Non-US listings** (L, product decision first). Allow suffixed tickers
   (`MDA.TO`) in watchlist and ledger, resolve bare tickers to `.US` as the
   news lib already does, show the listing's currency beside the price, and
   keep a mixed-currency portfolio total `null` until FX (EODHD forex, also
   included) is applied explicitly. Requires EODHD for quotes on those
   symbols (option 8's hybrid) because Finnhub has no Toronto tape.
8. **EODHD as the quote source** (S to build, but a freshness regression).
   Batch endpoint (15–20 symbols per call), volume field, non-US coverage;
   but 15-min delayed on London and probably on the US. **Not recommended as
   a replacement for Finnhub's `/quote`**; recommended only as the fallback
   for suffixed non-US symbols under option 7, with the UI marking those
   prices as delayed. Revisit after the 13:50 UTC measurement.
9. **Real-time WebSocket worker** (L, new infrastructure ~$5–7/mo plus
   Supabase Realtime or a public socket). See section 4. Justified only if
   pre/post-market or sub-second updates become a product requirement; not
   by any of the audit items above.
10. **Buy Fundamentals ($59.99) or All-In-One (+$70)** (S to wire once
    bought). Unlocks analyst ratings, beta, short float, EPS history, market
    cap/P/E for non-US, and (via Calendar) earnings actuals and surprises
    without Alpha Vantage's daily cap. Not needed for options 1–7.

## 6. Recommendation

**First step: option 1, daily bars from EODHD.** It is the smallest change
with the widest effect: one route and one adapter, the client already handles
every state, the key is already configured, there is no infrastructure, and
it un-breaks every chart and sparkline in the app plus the four stats that
hang off the bars. Then 2 (key stats) and 3 (volume), which together remove
the last invented numbers from the stock page and the movers screen.

Explicitly not doing, and why:

- **Not replacing Finnhub quotes with EODHD REST.** Measured 15–19 minutes
  behind on London; the US number comes at 13:50 UTC, and unless it is within
  a minute of the WebSocket the swap is a freshness regression dressed as
  consolidation.
- **Not building the WebSocket worker now.** One-connection-per-key and the
  50-symbol cap make it a single always-on process with its own operations,
  for a benefit (pre/post-market ticks) no current screen asks for.
- **Not buying Fundamentals yet.** Market cap and P/E for US names come free
  with the extended quote; analyst ratings alone do not justify $60/mo, and
  if they ever do, All-In-One at +$70 is the better buy than stacking.
- **Not re-proposing news or the earnings calendar.** Both are already real;
  the audit was stale on both.
