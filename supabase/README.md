# Supabase setup

One-time configuration for auth (Google now, Apple later). The app reads
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_APPLE_AUTH_ENABLED`
(see `app/.env.example`). Without them the sign-in screen renders disabled
with an honest "not configured" note — there is no local-only fallback.

## 1. Create the project

1. [supabase.com](https://supabase.com) → New project.
2. Note the **project ref** (in the project URL: `https://<project-ref>.supabase.co`).
3. Settings → API: copy the **Project URL** and **anon public key** into
   `app/.env.local` (copy `app/.env.example`). Never the service-role key.

## 2. Run the migration

Dashboard → SQL Editor → paste `migrations/0001_auth.sql` → Run.
Creates `profiles` + `user_state`, RLS policies, and the signup trigger.

### Later migrations

Run each in the same place, in order, once per project. They are not applied
by any build — `vercel deploy` never touches the database — so a migration
that has not been pasted into the SQL editor is not live, however green CI is.

- `0002_profile_identity.sql`, `0003_profile_overrides.sql` — profile fields.
- `0004_rls_initplan.sql` — performance-only RLS rewrite.
- `0005_ledger.sql` — **the holdings ledger.** Creates `portfolios` and
  `transactions`, their RLS policies, and extends the signup trigger to give
  every user a Sandbox portfolio (backfilling existing users in the same
  file). Must be run *before* deploying the client release that reads them;
  until it is, the client falls back to the legacy `user_state` jsonb copy of
  the ledger rather than showing an empty portfolio.
- `0006_alerts.sql` — **alerts that fire.** Creates `notifications` (what the
  engine fired, read by the notification centre), `alert_states` (the engine's
  memory between runs, no client access) and `push_subscriptions` (one row per
  device that turned push on), with their RLS policies. The alert rules
  themselves stay in `user_state.state`. Run it before deploying the client
  release that reads `notifications`; until it is, the notification centre
  reports "unavailable" and the push toggle cannot store a subscription. The
  engine itself (`app/api/alerts-run.ts`) is called by
  `.github/workflows/alerts.yml` — see "Alerts" in the root README for the
  secrets it needs.

### Verifying the ledger's RLS

`scripts/rls-check.mjs` points two throwaway users at a project and asserts, by
exit code, that the policies in `0005_ledger.sql` actually isolate them: that B
cannot read A's rows, cannot file a transaction into A's portfolio (which the
foreign key alone does not prevent — FKs are validated by the system, which does
not apply RLS), cannot insert a row stamped as A, and cannot delete A's
transactions; that a transaction cannot be updated even by its owner; that
Sandbox cannot be deleted; and that a signed-out visitor sees nothing.

It creates and deletes users, so run it against **staging, never production**,
and it needs credentials so it cannot run in CI. Treat it like the migrations
themselves — a pre-deploy step, run by hand:

```sh
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_ANON_KEY=<anon public key> \
SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
  node scripts/rls-check.mjs
```

The service-role key only creates and removes the two users; every assertion
runs through the anon key with a real user's access token, which is what the
browser has. Testing with the service role would bypass RLS and prove nothing.

## 3. Google sign-in (now)

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services
   → Credentials → Create credentials → **OAuth client ID** → type
   **Web application**.
   - **Authorized redirect URI (exact):**
     `https://<project-ref>.supabase.co/auth/v1/callback`
     (the Supabase callback — NOT the app's URL)
   - Authorized JavaScript origin (recommended):
     `https://<project-ref>.supabase.co`
2. Supabase Dashboard → **Authentication → Sign In / Providers → Google** →
   enable → paste the **Client ID** and **Client Secret** from step 1.
3. Supabase Dashboard → **Authentication → URL Configuration**:
   - **Site URL**: the production domain (e.g. `https://shift-app.vercel.app`)
   - **Additional Redirect URLs**:
     - `http://localhost:5173/**`
     - the Vercel preview pattern, e.g. `https://*-<team>.vercel.app/**`
   The app passes `redirectTo: window.location.origin`, which must match one
   of these.
4. Vercel → Project → Settings → Environment Variables: set all three
   `VITE_*` vars for Production and Preview.

## 4. Apple sign-in (later — configuration only, no code changes)

You will need, in this order:

1. **Apple Developer Program** membership ($99/year).
2. An **App ID** (Certificates, Identifiers & Profiles → Identifiers) with
   the *Sign in with Apple* capability enabled.
3. A **Services ID** — this becomes the OAuth **Client ID** Supabase asks
   for. In its *Sign in with Apple* configuration register:
   - Domain: `<project-ref>.supabase.co`
   - Return URL: `https://<project-ref>.supabase.co/auth/v1/callback`
4. A *Sign in with Apple* **private key** (`.p8` download) plus its
   **Key ID**, and your **Team ID** (top-right of the developer portal).
   These three generate the **client secret** (a signed JWT) that Supabase
   requires — the Supabase Apple-provider docs include a generator script.
   Note: the secret expires after at most 6 months and must be regenerated.
5. Supabase Dashboard → Authentication → Sign In / Providers → **Apple** →
   enable → paste the Services ID (as Client ID) and the generated secret.
6. Set `VITE_APPLE_AUTH_ENABLED=true` (Vercel env + `app/.env.local`) and
   redeploy.

That flips the already-shipped Apple button from its disabled
"not yet available" state to live. Nothing else to change.

## 5. Account deletion

Deleting a user is an admin operation that bypasses RLS, so it runs on the
server: `app/api/delete-account.ts`. It verifies the caller's access token
against Supabase, then deletes **that** user — the id comes from the verified
token, never from the request, so nobody can delete anyone else. The
`on delete cascade` in the migration removes the matching `profiles` and
`user_state` rows in the same operation.

One environment variable is required, **server-side only**:

- `SUPABASE_SERVICE_ROLE_KEY` — Settings → API → `service_role` (secret).

Never give it a `VITE_` prefix: that would inline it into the client bundle
and hand every visitor a key that ignores Row-Level Security. Set it in
Vercel → Settings → Environment Variables (Production and Preview).

**Testing it locally:** a plain `npm run dev` serves the Vite dev server only
and has no `/api/*` routes, so deletion will honestly report failure there.
Use `vercel dev`, or test it on a deployed preview.
