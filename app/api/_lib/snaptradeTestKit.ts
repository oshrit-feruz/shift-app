/**
 * Shared scaffolding for the two SnapTrade route suites.
 *
 * Both routes resolve the caller the same way — a bearer token Supabase turns
 * into a user id, then that user's sealed link row — so both suites need the
 * same environment, the same fixed encryption key, and the same stubbed
 * Supabase answers. Written once here so each suite says only what it is
 * about, and so the two cannot drift into testing different setups.
 *
 * Not a route helper: nothing in app/api imports this, and it exists purely to
 * keep the tests honest about being tests of the same thing.
 */

import { seal } from './secretBox.js';

export function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

export const SUPABASE_URL = 'https://project.supabase.co';
/** 32 bytes, fixed so a sealed secret written in one test opens in the next. */
export const ENC_KEY_B64 = Buffer.alloc(32, 7).toString('base64');
export const ENC_KEY = Buffer.from(ENC_KEY_B64, 'base64');
/** Who the access token resolves to. Never anything the request carried. */
export const AUTH_USER_ID = '11111111-2222-3333-4444-555555555555';
export const USER_SECRET = 'snaptrade-user-secret-abc';

/** A signed-in request. The token is opaque — Supabase is what resolves it. */
export const AUTHED = { authorization: 'Bearer access-token' };

/** The stored row for a user who has connected a brokerage. */
export const linkedRow = () => [{ snaptrade_user_id: AUTH_USER_ID, user_secret: seal(USER_SECRET, ENC_KEY) }];

export const SNAPTRADE_ENV = [
  'SNAPTRADE_CLIENT_ID',
  'SNAPTRADE_CONSUMER_KEY',
  'SNAPTRADE_PERSONAL_CLIENT_ID',
  'SNAPTRADE_PERSONAL_CONSUMER_KEY',
  'SNAPTRADE_SECRET_KEY',
  'SNAPTRADE_REDIRECT_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Captures the variables this kit overwrites, for the matching restore. */
export function captureEnv(): Record<string, string | undefined> {
  return Object.fromEntries(SNAPTRADE_ENV.map((n) => [n, process.env[n]]));
}

/** A configured deployment: both routes find everything they need. */
export function setEnv() {
  process.env.SNAPTRADE_CLIENT_ID = 'demo-client';
  process.env.SNAPTRADE_CONSUMER_KEY = 'demo-key';
  process.env.SNAPTRADE_SECRET_KEY = ENC_KEY_B64;
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  delete process.env.SNAPTRADE_PERSONAL_CLIENT_ID;
  delete process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY;
  delete process.env.SNAPTRADE_REDIRECT_URL;
}

/** Puts back exactly what captureEnv() saw, deleting what was not set. */
export function restoreEnv(saved: Record<string, string | undefined>) {
  for (const name of SNAPTRADE_ENV) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
