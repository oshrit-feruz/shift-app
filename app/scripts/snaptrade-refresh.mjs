/**
 * ONE-OFF OPERATOR SCRIPT — not part of the app, not reachable from it.
 *
 * SnapTrade serves a connection either `realtime` (queried during the call) or
 * `delayed` (served from a cache). For a delayed connection an empty account
 * list can simply mean the cache was never populated, and SnapTrade's manual
 * refresh is the documented way to populate it.
 *
 * That endpoint is a POST, and it is the reason it is here rather than behind
 * /api/snaptrade: that route is public and unauthenticated, and it stays
 * GET-only. This runs on your machine, with your credentials, only when you
 * ask it to.
 *
 * The signing is imported from the app's own api/_lib/snaptrade.ts rather than
 * copied, so this cannot drift from what the route actually sends.
 *
 * Usage — from app/:
 *   SNAPTRADE_PERSONAL_CLIENT_ID=... SNAPTRADE_PERSONAL_CONSUMER_KEY=... \
 *     node --experimental-strip-types scripts/snaptrade-refresh.mjs
 *
 * That lists your connections and stops. It changes nothing. To actually
 * trigger the refresh, add --refresh:
 *   ... node --experimental-strip-types scripts/snaptrade-refresh.mjs --refresh
 *
 * Read before running with --refresh: SnapTrade's docs say "each call to this
 * endpoint incurs an additional charge", with the amount on your dashboard's
 * billing page. On the free Personal tier that may well be zero, but this
 * script will not spend your money without you typing the flag.
 */

import { buildQuery, computeSignature, SNAPTRADE_BASE } from '../api/_lib/snaptrade.ts';

const clientId = process.env.SNAPTRADE_PERSONAL_CLIENT_ID;
const consumerKey = process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY;
if (!clientId || !consumerKey) {
  console.error('Set SNAPTRADE_PERSONAL_CLIENT_ID and SNAPTRADE_PERSONAL_CONSUMER_KEY.');
  process.exit(1);
}

/** One signed request. Same query-string-once rule as the route: the signature covers the exact string sent. */
async function call(method, path) {
  const query = buildQuery(clientId, Math.floor(Date.now() / 1000));
  const signature = computeSignature({ path: `/api/v1${path}`, query, consumerKey });
  const res = await fetch(`${SNAPTRADE_BASE}${path}?${query}`, {
    method,
    headers: { Accept: 'application/json', Signature: signature },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

const connections = await call('GET', '/authorizations');
if (!connections.ok || !Array.isArray(connections.body)) {
  console.error(`Could not list connections (HTTP ${connections.status}):`, connections.body);
  process.exit(1);
}
if (connections.body.length === 0) {
  console.error('No connections on this key. Link a brokerage in SnapTrade first.');
  process.exit(1);
}

for (const c of connections.body) {
  console.log(
    `${c.id}  ${c.brokerage?.display_name ?? c.brokerage?.name ?? '?'}  ` +
      `disabled=${c.disabled}  type=${c.type}  freshness=${c.data_freshness_mode}`,
  );
}

if (!process.argv.includes('--refresh')) {
  console.log('\nListing only. Re-run with --refresh to trigger a holdings sync.');
  process.exit(0);
}

for (const c of connections.body) {
  // A realtime connection is refreshed on every read, so the endpoint is
  // disabled for it — calling it would only produce an error, or a charge for
  // nothing.
  if (c.data_freshness_mode !== 'delayed') {
    console.log(`\n${c.id}: freshness is "${c.data_freshness_mode}", refresh does not apply. Skipped.`);
    continue;
  }
  if (c.disabled) {
    console.log(`\n${c.id}: connection is disabled — reconnect it in SnapTrade instead. Skipped.`);
    continue;
  }
  const r = await call('POST', `/authorizations/${encodeURIComponent(c.id)}/refresh`);
  console.log(`\n${c.id}: refresh -> HTTP ${r.status}`, r.body);
}

console.log('\nRefresh is queued asynchronously. Give it a few minutes, then re-check /api/snaptrade.');
