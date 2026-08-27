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
"unavailable" — never stale-cached or invented headlines. A ticker with fewer
than 10 (or even zero) recent real articles returns that shorter real list
as-is rather than padding it out.

**Required environment variable:** `EODHD_API_KEY` — the account's EODHD API
key, added in the Vercel dashboard under **Project → Settings → Environment
Variables**, scoped to Production, Preview, and Development so PR previews
and local `vercel dev` also work. It is read only server-side
(`process.env.EODHD_API_KEY`); it must never be given a `VITE_` prefix, which
would bundle it into the client build.

Pure request/response mapping lives in `app/api/_lib/news.ts` (unit-tested in
`news.test.ts`) so it doesn't require mocking global `fetch` or a Vercel
request/response pair to test. The `api/` directory has its own
`tsconfig.json` (`npm run typecheck:api`) since it's excluded from the main
app's `src`-scoped one and isn't bundled into the client build.

**A third live surface: real-time price-crossing alerts.** A saved 'price'
alert (`app/src/sheets/AlertSheet.tsx`) is watched against Alpaca's free IEX
real-time trade stream, connected to directly from the browser
(`app/src/data/alpacaLive.ts`, `useLiveQuotes.ts`) — there is no server in
this loop, for the same reason the Recovery Detector engine is mirrored
rather than called live: a WebSocket needs an always-on process to hold it,
and neither Vercel functions (invocation-scoped) nor this project's free
Render host (sleeps after ~15 min idle) can be that process. The browser
holding the connection while a tab is open needs nothing beyond those two
files.

Crossing detection (`app/src/lib/priceAlerts.ts`, unit-tested) fires once
on an actual side flip — below→above for a "rises above" alert, above→below
for "falls below" — never on every tick that happens to land past the
threshold, and never on the first price read for an alert already past its
line. `PriceAlertWatcher.tsx` runs this for every saved price alert,
recording each crossing in state (surfaced in `NotificationsSheet` with the
same fixed disclaimer and mark-as-read affordance as every other alert —
informational only) and firing a browser `Notification` when permission has
been granted.

**Data honesty caveat specific to this feed:** IEX is one exchange, not the
consolidated tape every other exchange also trades on. For a liquid ticker
this tracks the broker's price closely; for a thin one it can lag or gap.
It is a real trade the instant it happens — not delayed — but it is not
necessarily the same print as your broker's. Anywhere this price is shown,
the UI says "IEX", not just "live" (`live.iexNote` in `i18n/strings.ts`).

**Required environment variables (client-side, unlike `EODHD_API_KEY`):**
`VITE_ALPACA_KEY_ID` and `VITE_ALPACA_SECRET_KEY` — see `app/.env.example`.
Alpaca's WebSocket auth happens from the browser by design, so these ARE
bundled into the client and are visible to anyone who opens devtools.

> ⚠ **These must be paper-trading keys, never a live-trading key pair.** A
> leaked pair grants full access to the paper account's Trading API — market
> data, account/position reads, and placing orders — but on an account with
> no real money behind it, so the worst case is fake paper trades and
> visibility into fake paper holdings, not a real loss. Get a free pair at
> [app.alpaca.markets](https://app.alpaca.markets) → Paper Trading → API
> Keys. Leaving them unset does not break the app — price-alert crossing
> detection just stays inactive, and the alert sheet shows an
> "unconfigured" hint instead of a live price.

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
