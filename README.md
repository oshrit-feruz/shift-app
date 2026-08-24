# shift — robo-advisor client app

Client-facing app for the shift Core-Satellite investment platform (Milestone 1, Phase 1).
Dark, minimal RTL-Hebrew fintech UI matching the approved M1 mockup (Nocturne design system).

## What it is — and isn't

- A **read-only client** of the live Recovery Detector API
  (`https://stock-screener-7lvr.onrender.com`). It only ever issues GET requests and never
  re-implements or influences the signal engine's logic.
- **No trade execution anywhere.** Profile confirmation is a local understanding step; the
  disclosure screen states explicitly that no account action has been taken.
- **Data honesty:** if the live API is unavailable, the UI shows an honest error/unavailable
  state. There is no fake or placeholder data path.

## Screens

1. **Onboarding chat** (`/onboarding`) — scripted conversational flow (horizon, volatility
   attitude, goal, safety net, intended amount). Answers map to one of three fixed risk
   profiles via `src/domain/riskProfile.ts` — a single pure, table-driven, unit-tested
   function (the auditable allocation decision; deliberately not an LLM). Ends with a
   profile summary card + explicit confirmation, followed by a disclosure screen
   (`/disclosure`).
2. **Portfolio dashboard** (`/dashboard`) — Mark-to-Market value (the user's stated amount,
   labeled as an illustration, priced per the API's `as_of_date`), a prominent honest
   drawdown disclosure (static approved copy + realized drawdown from closed trades when
   history exists), the Core-Satellite model allocation (satellite ≤ 15%, hidden for the
   conservative profile), and live open positions from `/api/beta/dashboard`.

### Phase 2 screens

3. **Stock detail** (`/position/:ticker`) — opened from an open-position card. Position
   summary (entry → current, day N of 252) from the live API; "why this stock" computed
   from the live `/api/screener` ranking (honest unavailable state when the ranking is
   down or the ticker absent). Chart, financials, and news come from free official
   **TradingView embed widgets** (real market data, attributed, no API key) — chosen
   because keyed market-data APIs would expose their key in a public client, and the
   engine API exposes no historical series yet.
4. **Action center** (`/actions`, `/actions/:id`) — recommendations derived by
   `src/domain/recommendations.ts`: a pure, deterministic, unit-tested function of the
   confirmed profile and the live engine state (no backend, no LLM, no market
   predictions). Actionable items go through a detail screen and an explicit disclosure
   step; confirming records acknowledgement locally and executes nothing — referral-type
   items state that completion happens at the client's own bank. Live-data insights are
   omitted entirely (not guessed) when the API is unavailable.

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # typecheck + production build
npx vitest run     # unit tests (risk mapping + allocation invariants)
```

`VITE_API_BASE` overrides the API base URL (useful for failure-state testing).

## Structure

- `src/domain/` — pure business logic: risk mapping, model allocations, defensive
  position mapping (the API's position field names are tolerated loosely; missing values
  render as "—", never invented).
- `src/api/` — typed read-only API client.
- `src/screens/`, `src/components/` — UI per the M1 mockup.
- `src/nocturne.css` — design-system tokens/components ported verbatim from the approved
  mockup; `src/app.css` — app-specific layout.
