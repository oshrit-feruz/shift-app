import { readBearerToken, type ApiRequest, type ApiResponse } from './_lib/http.js';
import {
  SUPABASE_TIMEOUT_MS,
  fetchJsonWithTimeout,
  readAdminConfig,
  resolveUserId,
} from './_lib/supabaseAdmin.js';

/**
 * Records one conversion-funnel event.
 *
 * WHAT THIS ROUTE IS FOR: the four stages of the recommendation flow, so the
 * routing change that follows can be measured against a baseline instead of
 * against an impression. See supabase/migrations/0011_funnel_events.sql for
 * the table and the reasoning behind its shape.
 *
 * THE PRIVACY PROPERTY, stated where it can be checked. This route verifies
 * the caller's access token and then DISCARDS the user id it resolves. The
 * token check exists to stop /api/events being a public write endpoint that
 * anyone could fill with rows; it is not there to attribute the event, and
 * nothing about who called is written down. The row is: the stage, the tab's
 * session id, the device's anonymous id, and the time. There is no column for
 * anything else, so there is nowhere for a personal detail to arrive later
 * without a schema change.
 *
 * The two ids come from the request body, which the caller controls. That is
 * fine and is the point: they are random values minted on the device
 * (app/src/lib/analyticsIds.ts) with no join path to a person, so a forged one
 * can add noise to a funnel count but cannot impersonate anyone or read
 * anything. They are length-checked here so that a malformed value is
 * rejected with a clear 400 rather than by the column constraint as a 502.
 *
 * The service-role key is required because the table denies every client
 * operation (RLS on, no policies). It is server-only and never
 * VITE_-prefixed, the same convention as api/delete-account.ts.
 */

/** The four stages. Kept in step with the check constraint in the migration
 *  and with the FunnelEvent union in app/src/data/analytics.ts. A name
 *  outside this set is rejected rather than stored: an open set is how a
 *  funnel acquires six spellings of one step and stops being countable. */
const EVENT_NAMES = new Set([
  'reco_started',
  'reco_completed',
  'broker_screen_viewed',
  'broker_action_clicked',
]);

/** Matches the `length(...) between 8 and 64` checks on both id columns. */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
  }
  // Nothing here is cacheable, and an intermediary holding a funnel write
  // would replay it.
  res.setHeader('Cache-Control', 'private, no-store');

  const admin = readAdminConfig();
  if (!admin) {
    // Honest, and specifically NOT a 200. A deployment with no analytics
    // configured must not report events as recorded — a funnel that silently
    // reads zero is worse than one that is visibly switched off.
    return res.status(500).json({
      error: 'not_configured',
      message: 'Event recording is not configured on this deployment.',
    });
  }

  const body = req.body;
  if (body === null || typeof body !== 'object') {
    return res.status(400).json({ error: 'bad_request', message: 'Expected a JSON object body.' });
  }
  const { name, sessionId, anonId } = body as Record<string, unknown>;
  if (typeof name !== 'string' || !EVENT_NAMES.has(name)) {
    return res.status(400).json({ error: 'bad_request', message: 'Unknown event name.' });
  }
  if (!isValidId(sessionId) || !isValidId(anonId)) {
    return res.status(400).json({ error: 'bad_request', message: 'Malformed session or device id.' });
  }

  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token.' });
  }

  // Establish that SOMEBODY signed in is calling. The id is deliberately not
  // destructured, kept, or written — see the privacy note above.
  const who = await resolveUserId(admin, token, SUPABASE_TIMEOUT_MS);
  if ('failure' in who) {
    return who.failure === 'unauthorized'
      ? res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session.' })
      : res.status(502).json({ error: 'upstream_unreachable', message: 'Could not verify the session.' });
  }

  try {
    const write = await fetchJsonWithTimeout(`${admin.url}/rest/v1/funnel_events`, {
      method: 'POST',
      headers: {
        apikey: admin.serviceKey,
        Authorization: `Bearer ${admin.serviceKey}`,
        'Content-Type': 'application/json',
        // Nothing reads the inserted row back, and asking for it would only
        // spend bandwidth on a value this route discards.
        Prefer: 'return=minimal',
      },
      // created_at is the column default: the server's clock, not the
      // device's. A phone with a wrong clock would otherwise file events into
      // last week and quietly bend every date range in the report.
      body: JSON.stringify({ name, session_id: sessionId, anon_id: anonId }),
    });
    if (!write.ok) {
      // Logged with the status so a check-constraint rejection is
      // distinguishable from an outage; generic in the body, which no user
      // ever sees anyway.
      console.error(`events: insert failed with ${write.status}`);
      return res.status(502).json({ error: 'write_failed', message: 'The event was not recorded.' });
    }
  } catch {
    return res.status(502).json({ error: 'upstream_unreachable', message: 'The event was not recorded.' });
  }

  return res.status(202).json({ recorded: true });
}
