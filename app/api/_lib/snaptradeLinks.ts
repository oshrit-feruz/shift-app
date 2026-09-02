/**
 * The `public.snaptrade_users` row for one signed-in user: their SnapTrade
 * user id and the sealed `userSecret` that reads their brokerage account.
 *
 * Reached over PostgREST with the service-role key, because the table has no
 * RLS policies at all (supabase/migrations/0006_snaptrade.sql) — the browser
 * is denied even its own row, and this module is the only thing that opens the
 * ciphertext.
 *
 * A missing row is not a failure. It is the normal state of every user who has
 * not connected a brokerage yet, and it is returned as `null` so the routes can
 * answer "not linked" with a 200 rather than an error.
 */

import { open, seal } from './secretBox.js';
import { fetchJsonWithTimeout, type SupabaseAdminConfig } from './supabaseAdmin.js';

const TABLE = 'snaptrade_users';

export interface LinkStore extends SupabaseAdminConfig {
  /** The 32-byte AES key, already read and validated by secretBox.readKey. */
  encryptionKey: Buffer;
}

export interface SnapTradeLink {
  snapTradeUserId: string;
  userSecret: string;
}

/** The one shape every request here sends. */
function headers(store: LinkStore, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: store.serviceKey,
    Authorization: `Bearer ${store.serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Raised when the row exists but cannot be used — the ciphertext did not open.
 *
 * Distinct from "no row" on purpose. Reporting a corrupt or wrong-key secret
 * as "you have not connected an account" would invite the user to link a second
 * one on top of a live connection they still have, and would quietly hide a
 * key rotation that went wrong.
 */
export class LinkUnreadableError extends Error {}

/**
 * Reads one user's link. `null` when they have never connected a brokerage.
 *
 * PostgREST answers a filtered select with an array; `maybeSingle` semantics
 * are done here rather than with an Accept header so a surprising body shape
 * fails loudly instead of being read as an empty result.
 */
export async function readLink(
  store: LinkStore,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SnapTradeLink | null> {
  const url =
    `${store.url}/rest/v1/${TABLE}` +
    `?user_id=eq.${encodeURIComponent(userId)}&select=snaptrade_user_id,user_secret&limit=1`;
  const res = await fetchJsonWithTimeout(url, { headers: headers(store) }, undefined, fetchImpl);
  if (!res.ok) throw new Error(`snaptrade_users read failed with ${res.status}`);
  if (!Array.isArray(res.body)) throw new Error('snaptrade_users read returned a non-array body');
  const row = res.body[0];
  if (row === undefined) return null;
  if (typeof row !== 'object' || row === null) throw new Error('snaptrade_users row is not an object');
  const { snaptrade_user_id: id, user_secret: sealed } = row as Record<string, unknown>;
  if (typeof id !== 'string' || typeof sealed !== 'string') {
    throw new Error('snaptrade_users row is missing its id or secret');
  }
  const userSecret = open(sealed, store.encryptionKey);
  if (userSecret === null) throw new LinkUnreadableError('stored userSecret did not decrypt');
  return { snapTradeUserId: id, userSecret };
}

/**
 * Writes (or replaces) one user's link, sealing the secret on the way in.
 *
 * An upsert rather than an insert: re-registering is how a user who lost their
 * secret gets a working one back, and a second row for the same person is not a
 * state this table should be able to reach.
 */
export async function saveLink(
  store: LinkStore,
  userId: string,
  link: SnapTradeLink,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchJsonWithTimeout(
    `${store.url}/rest/v1/${TABLE}?on_conflict=user_id`,
    {
      method: 'POST',
      headers: headers(store, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        user_id: userId,
        snaptrade_user_id: link.snapTradeUserId,
        user_secret: seal(link.userSecret, store.encryptionKey),
        updated_at: new Date().toISOString(),
      }),
    },
    undefined,
    fetchImpl,
  );
  if (!res.ok) throw new Error(`snaptrade_users write failed with ${res.status}`);
}

/**
 * Removes one user's link. Deleting a row that is not there is a success: the
 * caller asked for it to be gone, and it is.
 */
export async function deleteLink(
  store: LinkStore,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchJsonWithTimeout(
    `${store.url}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(userId)}`,
    { method: 'DELETE', headers: headers(store, { Prefer: 'return=minimal' }) },
    undefined,
    fetchImpl,
  );
  if (!res.ok) throw new Error(`snaptrade_users delete failed with ${res.status}`);
}
