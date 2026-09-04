/**
 * The conversion funnel, client side: four event names and one way to send
 * them.
 *
 * WHY IT IS SO SMALL. This exists to answer four questions about the
 * recommendation flow — how many sessions start the questions, reach an
 * allocation, reach the broker screen, and act on it — measured on the flow
 * as it stands today, so that the routing change coming after it can be
 * judged against a baseline rather than against a feeling. It is not a
 * general analytics layer, and the closed `FunnelEvent` union is what keeps
 * it from quietly becoming one: a fifth event is a deliberate change here
 * and in the table's check constraint.
 *
 * WHAT IT SENDS: the event name, the tab's session id, and the device's
 * anonymous id (lib/analyticsIds.ts). No user id, no ticker, no amount, no
 * profile, no URL, no properties bag at all — there is nowhere for a stray
 * personal detail to be added later without editing this type.
 *
 * WHY THERE IS NO API ROUTE. The write goes straight to Supabase under the
 * insert-only policy in 0011_funnel_events.sql. An earlier version of this
 * put a serverless function in front of it that verified a bearer token and
 * then threw the resolved user id away; `to authenticated` on the policy
 * says the same thing in the database, and the deployment's function budget
 * (twelve, and twelve already spoken for) is not worth spending on a hop
 * that added nothing. `created_at` is kept honest by a column-level grant
 * rather than by that route — see the migration.
 *
 * THE RULE THIS FILE OBEYS: measuring must never break the thing it
 * measures. Every failure — offline, no session, RLS refusing, storage
 * throwing — is swallowed, and no caller ever awaits a result. A missing
 * event costs an undercount in a report; a thrown one costs the user their
 * screen.
 */

import { supabase } from '../lib/supabase';
import { anonId, sessionId } from '../lib/analyticsIds';

/** The four stages. Kept in step with the check constraint in
 *  supabase/migrations/0011_funnel_events.sql. */
export type FunnelEvent =
  'reco_started' | 'reco_completed' | 'broker_screen_viewed' | 'broker_action_clicked';

/** The table the events land in. */
export const FUNNEL_TABLE = 'funnel_events';

/**
 * Where the "already recorded in this session" set is kept.
 *
 * sessionStorage, NOT a module-scope Set alone. The session id itself lives
 * in sessionStorage (lib/analyticsIds.ts), which survives a reload — so a
 * guard held only in memory would reset on reload while the id it guards
 * stayed the same, and returning to a tracked screen would file a second
 * view row for one session. That is precisely the once-per-session contract
 * this guard exists to keep, broken by the guard itself.
 *
 * The database enforces the same rule independently (the partial unique
 * index in 0011_funnel_events.sql), so a duplicate cannot land even if this
 * fails entirely. This is here to avoid the pointless round trip, and to
 * make the contract legible where the events are sent from.
 */
const SENT_KEY = 'shift.analytics.sent';

/**
 * The in-memory mirror. Read first because it needs no storage access, and
 * it is the only guard when storage throws (Safari private mode, cookies
 * blocked) — where it still covers everything except a reload.
 */
const sentThisSession = new Set<FunnelEvent>();

/** The stages recorded so far in this session, from both stores. */
function alreadySent(name: FunnelEvent): boolean {
  if (sentThisSession.has(name)) return true;
  try {
    const raw = sessionStorage.getItem(SENT_KEY);
    return raw !== null && (JSON.parse(raw) as unknown[]).includes(name);
  } catch {
    // No storage, or a value some other tool wrote over ours. The in-memory
    // set above still holds for this page, and the unique index still holds
    // for the table.
    return false;
  }
}

/**
 * Records `name` as sent, in both stores.
 *
 * Written BEFORE the insert is attempted, not after it resolves: two mounts
 * in the same frame would both pass an after-the-fact check and send twice.
 */
function markSent(name: FunnelEvent) {
  sentThisSession.add(name);
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify([...sentThisSession]));
  } catch {
    /* persistence is best-effort; see alreadySent */
  }
}

/**
 * Records `name`, at most once per session for the three view events.
 *
 * Fire and forget: this returns void rather than a promise so that no call
 * site can accidentally await it and put the network on a render path.
 */
export function track(name: FunnelEvent) {
  if (name !== 'broker_action_clicked') {
    if (alreadySent(name)) return;
    markSent(name);
  }
  void send(name);
}

/**
 * The insert itself. Separated from `track` so the guard above is readable
 * on its own, and so tests can exercise the two halves apart.
 */
async function send(name: FunnelEvent): Promise<void> {
  try {
    // No client configured: nothing to send, and nothing to report either —
    // a deployment without Supabase has no working app to measure.
    if (!supabase) return;

    // The policy only admits `authenticated`, so an insert with no session
    // would be refused. Checked here so the common signed-out case is a
    // no-op rather than a round trip that always fails.
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;

    // created_at is deliberately absent: it is the column default, the
    // server's clock rather than the device's, and the column grant in the
    // migration means this row could not set it even if it tried. A phone
    // with a wrong clock would otherwise file events into last week and bend
    // every date range in the report.
    await supabase.from(FUNNEL_TABLE).insert({
      name,
      session_id: sessionId(),
      anon_id: anonId(),
    });
  } catch {
    /* Never surfaces. See the rule at the top of this file. */
  }
}

/** Test seam: forgets what this session has already recorded, in both stores. */
export function resetFunnelSessionForTest() {
  sentThisSession.clear();
  try {
    sessionStorage.removeItem(SENT_KEY);
  } catch {
    /* nothing to clear */
  }
}
