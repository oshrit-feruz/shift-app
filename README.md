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

- **`app/src/styles/tokens.css`** — every color, radius, shadow, font, type
  step (`--fs-*`, `--fw-*`) and spacing step (`--space-*`), lifted from the
  design. Three global switches set as attributes on `<html>`:
  `data-theme` (dark default / light), `data-signal` (vivid / balanced / muted
  gain-loss colors), `dir` (rtl Hebrew default / ltr English). Change a token
  here and it propagates everywhere; no screen declares its own colors, sizes
  or radii.
- **`app/src/components/`** — the component library (Card, Button, Tag, Chip,
  IconTile, OptionCard, TickerTile, ListRow, AllocationBar/SegmentBar,
  DonutChart, CandleChart, Sheet, ChatBubble, TabBar, …). Screens in
  `app/src/screens/` compose only these — list rows, icon tiles, option
  cards and pills are never re-implemented inline.
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
- **Data honesty** (`app/src/data/`): every on-screen number flows through the
  `DataService` seam (`loading | unavailable | ok`) and screens render all
  three honestly — an API failure shows an explicit "unavailable" state, never
  a fabricated number; no open Satellite positions renders as genuinely empty
  ("אין פוזיציות פתוחות כרגע"). Settings → Data & display has demo switches for
  both states. Alerts, notifications and connected accounts derive only from
  what the user actually configured; the app header carries a permanent
  "Demo data" marker while the demo adapter is the data source. Pension /
  hishtalmut / bank show totals by provider only, in a separate read-only
  section, never merged into the managed portfolio number.
- **The advisory profile is never defaulted**: an incomplete answer set renders
  a "profile not determined" gate back to the questionnaire, and setup-resume
  can't land past the chat without a deterministically-mapped profile.
- **Referral hand-off is real**: "open an account at {broker}" links out to the
  broker's official site in a new tab (no affiliate parameters); nothing opens
  or executes inside Shift.

## Data

`app/src/data/demoAdapter.ts` is a clearly-labeled **demo** implementation of
the `DataService` interface (`service.ts`) carrying the prototype's numbers. A
real backend drops in by implementing that interface; no UI changes needed.

## ⚠ Needs product sign-off before production

- **Core fund names** (VOO / VEA / IEFA / LQD / VMFXX / EEM in
  `app/src/lib/advisory.ts`) are realistic placeholders. Which funds the
  product actually recommends is a material product decision.
- Broker/provider logos in `app/public/assets/` are third-party brand assets
  carried over from the design mockups for demo purposes.
