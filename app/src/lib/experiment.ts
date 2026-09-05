/**
 * The entry experiment: which door a new user is shown.
 *
 * PR 2 routes half of new users straight into the recommendation flow and
 * offers it to the other half from the home screen, so the funnel can answer
 * a question a judgement call cannot: does routing people in produce more
 * first actions than putting a card in front of them?
 *
 * WHAT IS RECORDED, AND WHEN. An arm is assigned exactly once, at the moment a
 * device finishes the first-run overlay while eligible (screens/onboarding/
 * FirstRunOverlay.tsx). Nothing derives an arm on the fly at event time, and
 * that is the load-bearing decision here:
 *
 *   A device hash evaluated inside `track` would label EVERY event, including
 *   every existing user who was never shown either door. `group by variant`
 *   would then compare two arbitrary halves of the whole userbase rather than
 *   the experiment, and the difference would be diluted by everyone who was
 *   never in it. So the arm is stored when it is actually applied, and every
 *   event from a device that never entered carries null.
 *
 * The split is a hash of `anonId`, not a coin flip, so it is stable: the same
 * device gets the same arm if the assignment is ever recomputed, and the arm
 * cannot drift between the routing decision and the events that follow it.
 * Device granularity matches the funnel itself, which already counts one
 * person on two devices as two (lib/analyticsIds.ts).
 *
 * CLEARED ON ACCOUNT CHANGE, beside the other device-level state that is
 * (auth/AuthProvider.tsx, adoptUser). `firstRunSeen` resets on the same
 * transition, so the next person on this device is shown a door again — and
 * must be assigned an arm again rather than inheriting the last person's.
 * Leaving it would attribute their journey to an arm they were never shown.
 *
 * Storage can throw (Safari private mode, cookies blocked). Every path here is
 * wrapped: an unreachable store means no arm, which means null in the events
 * and a user who is simply not in the experiment. Measurement is never allowed
 * to break the thing it measures.
 */

import { anonId } from './analyticsIds';
import type { HoldingsSource } from './holdings';
import type { Screen } from '../state/appState';

/** The two doors. 'offered' is the control — today's behaviour. */
export type EntryVariant = 'routed' | 'offered';

const KEY = 'shift.experiment.entry';

/**
 * WHOSE arm this is, stored beside it because the browser outlives the
 * session — the same reasoning, and the same shape, as the linked-brokerage
 * flag's owner key (data/linkState.ts).
 *
 * It exists as its own key rather than reusing that one. `linkedUserId()` is
 * written only by a successful read of /api/snaptrade, so for a reader with no
 * brokerage — or any reader whose first read failed — it is null, and null is
 * indistinguishable from "somebody else". Comparing against it would clear the
 * arm on every auth event that followed, token refresh included, and the rest
 * of that person's journey would land in the funnel with no arm at all. That
 * is precisely the reader this experiment is about.
 */
const OWNER_KEY = 'shift.experiment.entryUser';

/** Set when storage is unusable, so an arm still holds for this page load. */
let memory: EntryVariant | null = null;
let memoryOwner: string | null = null;

function isVariant(v: string | null): v is EntryVariant {
  return v === 'routed' || v === 'offered';
}

/**
 * Which arm this device is in, or null when it never entered the experiment.
 *
 * Null is the common answer and is not a failure: every existing user, and
 * everyone past their first run before this shipped, reads null forever.
 */
export function entryVariant(): EntryVariant | null {
  if (memory !== null) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    return isVariant(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The arm this device would be assigned, from a hash of its anonId.
 *
 * FNV-1a, because it needs to be stable and evenly split and nothing more —
 * this decides which of two screens someone sees, not anything anyone could
 * gain by predicting. Exported for the test that checks the split is roughly
 * even rather than, say, always the same arm.
 */
export function variantFor(id: string): EntryVariant {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    // codePointAt rather than charCodeAt (SonarCloud typescript:S7758). The two
    // are identical for every input this can receive — lib/ids.ts mints
    // `prefix-` plus a UUID, hex bytes or base36, all ASCII — so this is the
    // lint's preference honoured at no cost, not a behaviour change. The `?? 0`
    // is unreachable for the same reason: i is always in range.
    h ^= id.codePointAt(i) ?? 0;
    // >>> 0 keeps it unsigned; Math.imul keeps the multiply from losing the
    // high bits to float precision, which would bias the split.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 2 === 0 ? 'routed' : 'offered';
}

/**
 * Assigns this device an arm, once, and returns it.
 *
 * Idempotent: a device that already has one keeps it, so a second call cannot
 * move someone between arms mid-experiment — which would make their events
 * uncomparable with either group.
 */
export function assignEntryVariant(): EntryVariant {
  const existing = entryVariant();
  if (existing !== null) return existing;
  const assigned = variantFor(anonId());
  // Held in memory first, so the arm is right for this page load even when the
  // write throws — the same ordering, and for the same reason, as
  // data/demoFlags.ts `set`.
  memory = assigned;
  try {
    localStorage.setItem(KEY, assigned);
  } catch {
    /* no storage: the arm holds for this load and is not remembered */
  }
  return assigned;
}

/** Who the stored arm belongs to, or null when nobody has claimed one. */
export function entryVariantOwner(): string | null {
  if (memoryOwner !== null) return memoryOwner;
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * Records that this device's arm belongs to `userId`, clearing it first if it
 * belonged to somebody else.
 *
 * Called on every resolved session, so it has to be a no-op for the case that
 * dominates: the same person, again, on a token refresh. Hence a clear only on
 * a KNOWN owner that differs. An unclaimed arm is adopted rather than
 * discarded — the assignment is made on the first run, which is before any
 * owner has been recorded, and discarding it there would empty the experiment
 * of the very people it is measuring.
 */
export function adoptEntryVariant(userId: string) {
  const previous = entryVariantOwner();
  if (previous !== null && previous !== userId) clearEntryVariant();
  memoryOwner = userId;
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* no storage: ownership holds for this load and is not remembered */
  }
}

/**
 * Forgets the arm and who it belonged to. Called on sign-out and on a change
 * of account, beside the other device-level state that is cleared there.
 */
export function clearEntryVariant() {
  memory = null;
  memoryOwner = null;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* nothing stored to clear */
  }
}

/**
 * Where the first-run overlay lets someone out, as a value rather than a
 * branch buried in a component.
 *
 * Pure and exported because this is the one decision the experiment actually
 * makes, and every way it can be wrong is silent: routing someone who holds
 * something, restarting a flow that was already part-way through, or sending
 * the control arm somewhere other than where it has always gone. None of those
 * throws and none is visible in a screenshot.
 *
 * `source` — only a reader with nothing is in scope. 'demo' means the sample
 * switch is on and the app is showing invented positions; 'live' means a
 * brokerage is remembered. Both are someone the question is not about, and
 * both keep the path they had.
 *
 * `resumeScreen` — from setupProgress(). For a genuinely new reader this is
 * the first question, so passing it costs nothing; for anyone who is somehow
 * already part-way through it is the difference between continuing and being
 * restarted from the top.
 */
export function firstRunDestination(
  source: HoldingsSource,
  variant: EntryVariant | null,
  resumeScreen: Screen,
): Screen {
  if (source !== 'none') return 'steps';
  return variant === 'routed' ? resumeScreen : 'steps';
}
