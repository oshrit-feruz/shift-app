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
