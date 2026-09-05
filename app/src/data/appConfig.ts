/**
 * Runtime configuration, read once at boot from Supabase.
 *
 * WHY THIS EXISTS. PR 2 changed the first screen a new user sees. Reverting
 * that had to be possible without a deploy, and the repo's existing flags
 * cannot do it: `VITE_REQUIRE_INSTALL` and `VITE_APPLE_AUTH_ENABLED`
 * (lib/install.ts, lib/supabase.ts) are build-time Vite variables, so changing
 * one on Vercel still rebuilds and redeploys. This reads a single boolean out
 * of `public.app_config` (supabase/migrations/0013_app_config.sql), so turning
 * the experiment off takes effect on the next load, for everyone.
 *
 * OFF IS THE DEFAULT, AND OFF IS ALSO EVERY FAILURE. Not configured, network
 * down, table missing, request still in flight, storage of any kind refusing —
 * all of them read false, which is TODAY'S behaviour: the first-run overlay
 * ends at the first-steps checklist, exactly as it did before PR 2. The
 * asymmetry is deliberate and is the whole point of the switch. If an
 * unreachable config could enable the new flow, then an outage would ship a
 * routing change nobody approved, and the safe state has to be the one the
 * app already had rather than the one being tested.
 *
 * READ ONCE, NOT SUBSCRIBED. Unlike data/linkState.ts and data/demoFlags.ts
 * there is no listener set and no re-render on change: the value is consumed
 * at exactly one moment — FirstRunOverlay's finish() — and a flag that changed
 * underneath a half-finished overlay would move somebody between arms mid
 * decision. One read per load is both simpler and more correct here.
 */

import { supabase } from '../lib/supabase';

/** The single row the table is constrained to hold. */
const TABLE = 'app_config';
const ROW_ID = true;

/**
 * False until a successful read says otherwise; thereafter whatever the last
 * successful read said. A failed read never changes it, so a flag that is on
 * does not fall off because one request timed out.
 *
 * In practice it is written at most once, because `loadAppConfig` is called
 * once per page load (main.tsx). That is what keeps the value stable across
 * the moment it is consumed, rather than any latching here.
 */
let entryExperiment = false;

/**
 * Whether new readers may be assigned an arm of the entry experiment.
 *
 * Synchronous by design — the routing decision it feeds is synchronous, and a
 * decision that awaited a fetch would either block the first screen or flicker
 * it. If the read has not landed yet this answers false, which routes to the
 * unchanged path; see the module note on why every unknown is false.
 */
export function entryExperimentEnabled(): boolean {
  return entryExperiment;
}

/**
 * Fetches the config. Called once, before the first render (main.tsx).
 *
 * Fire and forget: nothing waits on it and nothing surfaces a failure, because
 * a failure is not an error state — it is the app's existing behaviour. The
 * promise is returned only so tests can await it.
 */
export async function loadAppConfig(): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('entry_experiment_enabled')
      .eq('id', ROW_ID)
      .maybeSingle();
    // `maybeSingle` returns null rather than throwing when the row is missing.
    // A missing row is not "enabled by default" — it is a config that cannot
    // be read, which is the same as off.
    if (error || !data) return;
    entryExperiment = data.entry_experiment_enabled === true;
  } catch {
    /* unreachable config reads as off, which is the unchanged experience */
  }
}
