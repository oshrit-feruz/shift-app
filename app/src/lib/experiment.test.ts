import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The entry experiment's assignment, and the three ways it can be wrong in a
 * way nobody would notice from the outside:
 *
 *   - labelling people who were never in it, which makes `group by variant` a
 *     comparison of two halves of the userbase instead of the experiment;
 *   - moving someone between arms, which makes their events uncomparable with
 *     either group while still counting in both denominators;
 *   - a split that collapses, which produces an experiment with no control and
 *     a perfectly plausible funnel underneath it.
 *
 * None of those throws, and none is visible on screen. They are only visible
 * later, in a number someone believes.
 *
 * Each case imports the module fresh, because it keeps the assigned arm at
 * module scope as a fallback for storage that cannot be written.
 */

const KEY = 'shift.experiment.entry';
const OWNER_KEY = 'shift.experiment.entryUser';

/** A working storage, seeded with whatever a case wants already stored. */
function makeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    api: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}

/** Reads work, writes throw — Safari private mode. */
function writeOnlyThrows(seed: Record<string, string> = {}) {
  const s = makeStorage(seed);
  return {
    store: s.store,
    api: {
      ...s.api,
      setItem() {
        throw new Error('QuotaExceededError');
      },
    },
  };
}

/** Storage that throws on every access. */
const throwing = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
  removeItem() {
    throw new Error('denied');
  },
};

async function freshModule() {
  vi.resetModules();
  return import('./experiment');
}

afterEach(() => vi.unstubAllGlobals());

describe('who is in the experiment', () => {
  it('nobody, until a device is actually assigned', async () => {
    // The property the whole design rests on. An existing user never reaches
    // the first-run overlay, so nothing ever assigns them an arm, so every
    // event they produce carries null and stays out of the comparison.
    vi.stubGlobal('localStorage', makeStorage().api);
    const { entryVariant } = await freshModule();
    expect(entryVariant()).toBeNull();
  });

  it('assignment writes the arm through, once', async () => {
    const local = makeStorage();
    vi.stubGlobal('localStorage', local.api);
    const { assignEntryVariant, entryVariant } = await freshModule();

    const first = assignEntryVariant();
    expect(entryVariant()).toBe(first);
    expect(local.store.get(KEY)).toBe(first);
  });

  it('a stored arm wins over what the hash would say now', async () => {
    // This is what the idempotence guard actually protects, and the reason
    // asserting `assign() === assign()` is not enough: the hash is
    // deterministic, so that holds even with the guard removed. What must not
    // happen is a device being RE-derived — if it were, a reassignment could
    // move someone already halfway through a journey into the other arm,
    // putting one person's funnel on both sides of the comparison.
    //
    // The device id is seeded rather than minted, so the arm the hash would
    // choose is known and the opposite can be stored deliberately. Without
    // that, a fresh id gets minted here and the assertion becomes a coin flip
    // that passes half the time with the guard removed.
    const ANON = 'a-fixed-device-id-for-this-case';
    const probe = makeStorage();
    vi.stubGlobal('localStorage', probe.api);
    const natural = (await freshModule()).variantFor(ANON);
    const opposite = natural === 'routed' ? 'offered' : 'routed';

    const local = makeStorage({ 'shift.analytics.anonId': ANON, [KEY]: opposite });
    vi.stubGlobal('localStorage', local.api);
    const { assignEntryVariant, entryVariant } = await freshModule();

    expect(assignEntryVariant()).toBe(opposite);
    expect(entryVariant()).toBe(opposite);
    expect(local.store.get(KEY)).toBe(opposite);
  });

  it('survives a reload', async () => {
    // Written by one page load, read by the next, with no memory in between.
    vi.stubGlobal('localStorage', makeStorage({ [KEY]: 'routed' }).api);
    const { entryVariant } = await freshModule();
    expect(entryVariant()).toBe('routed');
  });

  it('a junk value reads as "not in the experiment", not as an arm', async () => {
    // A hand-edited or half-written value must not become a third arm, and
    // must not be believed as one of the two.
    vi.stubGlobal('localStorage', makeStorage({ [KEY]: 'control' }).api);
    const { entryVariant } = await freshModule();
    expect(entryVariant()).toBeNull();
  });
});

describe('clearing on account change', () => {
  it('forgets the arm, so the next person is assigned their own', async () => {
    const local = makeStorage();
    vi.stubGlobal('localStorage', local.api);
    const { assignEntryVariant, clearEntryVariant, entryVariant } = await freshModule();

    assignEntryVariant();
    expect(entryVariant()).not.toBeNull();

    clearEntryVariant();
    expect(entryVariant()).toBeNull();
    expect(local.store.has(KEY)).toBe(false);
  });
});

describe('whose arm it is', () => {
  it('keeps it across repeat adoptions by the same person', async () => {
    // The regression this guards. `adoptUser` runs on every resolved session,
    // token refresh included — several times over a long visit. If any of
    // those dropped the arm, every event after it would carry null and the
    // second half of that person's funnel would leave the experiment.
    const local = makeStorage();
    vi.stubGlobal('localStorage', local.api);
    const { adoptEntryVariant, assignEntryVariant, entryVariant } = await freshModule();

    adoptEntryVariant('user-a');
    const assigned = assignEntryVariant();
    adoptEntryVariant('user-a');
    adoptEntryVariant('user-a');

    expect(entryVariant()).toBe(assigned);
  });

  it('adopts an arm nobody has claimed rather than discarding it', async () => {
    // The order the app actually runs in: the overlay can assign before any
    // owner has been recorded. Treating an unowned arm as somebody else's
    // would empty the experiment of the people it is measuring.
    const local = makeStorage({ [KEY]: 'routed' });
    vi.stubGlobal('localStorage', local.api);
    const { adoptEntryVariant, entryVariant, entryVariantOwner } = await freshModule();

    adoptEntryVariant('user-a');

    expect(entryVariant()).toBe('routed');
    expect(entryVariantOwner()).toBe('user-a');
  });

  it('drops it when a different person signs in without a sign-out', async () => {
    const local = makeStorage();
    vi.stubGlobal('localStorage', local.api);
    const { adoptEntryVariant, assignEntryVariant, entryVariant } = await freshModule();

    adoptEntryVariant('user-a');
    assignEntryVariant();

    adoptEntryVariant('user-b');

    expect(entryVariant()).toBeNull();
    expect(local.store.has(KEY)).toBe(false);
  });

  it('remembers the owner across a reload', async () => {
    const local = makeStorage({ [KEY]: 'offered', [OWNER_KEY]: 'user-a' });
    vi.stubGlobal('localStorage', local.api);
    const { adoptEntryVariant, entryVariant } = await freshModule();

    adoptEntryVariant('user-a');

    expect(entryVariant()).toBe('offered');
  });

  it('forgets the owner along with the arm, so nobody inherits either', async () => {
    const local = makeStorage();
    vi.stubGlobal('localStorage', local.api);
    const { adoptEntryVariant, assignEntryVariant, clearEntryVariant, entryVariantOwner } =
      await freshModule();

    adoptEntryVariant('user-a');
    assignEntryVariant();
    clearEntryVariant();

    expect(entryVariantOwner()).toBeNull();
    expect(local.store.has(OWNER_KEY)).toBe(false);
  });

  it('never throws when storage cannot be reached', async () => {
    vi.stubGlobal('localStorage', throwing);
    const { adoptEntryVariant, entryVariantOwner } = await freshModule();

    expect(() => adoptEntryVariant('user-a')).not.toThrow();
    expect(entryVariantOwner()).toBe('user-a');
  });
});

describe('the split', () => {
  it('is stable for a given id', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    const { variantFor } = await freshModule();
    const id = 'a-device-that-does-not-change';
    expect(variantFor(id)).toBe(variantFor(id));
  });

  it('is roughly even, rather than one arm for everyone', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    const { variantFor } = await freshModule();

    let routed = 0;
    const n = 2000;
    for (let i = 0; i < n; i += 1) {
      if (variantFor(`a-${i}-${i * 7919}`) === 'routed') routed += 1;
    }
    // Generous bounds: this is checking the hash does not collapse, not that
    // it is a good PRNG. A degenerate hash lands at 0 or n.
    expect(routed).toBeGreaterThan(n * 0.4);
    expect(routed).toBeLessThan(n * 0.6);
  });

  it('is decided by the whole id, not its first characters', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    const { variantFor } = await freshModule();
    // Real anonIds share the 'a-' prefix by construction (lib/ids.ts), so a
    // hash that stopped early would put every device in the same arm.
    const shared = 'a-'.padEnd(24, 'x');
    const arms = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((k) => variantFor(shared + k)));
    expect(arms.size).toBe(2);
  });
});

describe('when storage cannot be reached', () => {
  it('still holds an arm for this page load when the write throws', async () => {
    // The dangerous half of Safari private mode: reads succeed, writes throw.
    // Without the in-memory fallback the reader would be routed in and then
    // have every one of their events recorded under no arm at all — a journey
    // in the numerator of neither group.
    vi.stubGlobal('localStorage', writeOnlyThrows().api);
    const { assignEntryVariant, entryVariant } = await freshModule();

    const assigned = assignEntryVariant();
    expect(assigned === 'routed' || assigned === 'offered').toBe(true);
    expect(entryVariant()).toBe(assigned);
  });

  it('reads as "not in the experiment" when every access throws', async () => {
    vi.stubGlobal('localStorage', throwing);
    const { entryVariant } = await freshModule();
    expect(entryVariant()).toBeNull();
  });

  it('never throws, on any path', async () => {
    vi.stubGlobal('localStorage', throwing);
    const { assignEntryVariant, clearEntryVariant, entryVariant } = await freshModule();
    expect(() => entryVariant()).not.toThrow();
    expect(() => assignEntryVariant()).not.toThrow();
    expect(() => clearEntryVariant()).not.toThrow();
  });
});

describe('which arm the first run routes by', () => {
  it('does not put a new device into a switched-off experiment', async () => {
    const local = makeStorage();
    vi.stubGlobal('localStorage', local.api);
    const { entryArmFor, entryVariant } = await freshModule();

    expect(entryArmFor('none', false)).toBeNull();
    // And no arm was minted on the way past, so nothing to inherit later.
    expect(entryVariant()).toBeNull();
    expect(local.store.has(KEY)).toBe(false);
  });

  it('puts a new device in when the switch is on', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    const { entryArmFor } = await freshModule();

    expect(entryArmFor('none', true)).not.toBeNull();
  });

  it('KEEPS routing by an arm the device already has, switch off', async () => {
    // The one that matters. `track` labels every event with the stored arm
    // whatever the switch says, so a device routed down the offered path while
    // its events carry 'routed' would put one person's journey on both sides
    // of the comparison. The switch gates entering, not being recognised.
    vi.stubGlobal('localStorage', makeStorage({ [KEY]: 'routed' }).api);
    const { entryArmFor } = await freshModule();

    expect(entryArmFor('none', false)).toBe('routed');
  });

  it('keeps the control arm too, not just the routed one', async () => {
    vi.stubGlobal('localStorage', makeStorage({ [KEY]: 'offered' }).api);
    const { entryArmFor } = await freshModule();

    expect(entryArmFor('none', false)).toBe('offered');
  });

  it('never routes a reader who holds something, in any combination', async () => {
    vi.stubGlobal('localStorage', makeStorage({ [KEY]: 'routed' }).api);
    const { entryArmFor } = await freshModule();

    for (const source of ['demo', 'live'] as const)
      for (const on of [true, false]) expect(entryArmFor(source, on)).toBeNull();
  });
});

describe('where the first run lets someone out', () => {
  it('routes the routed arm into the flow', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    const { firstRunDestination } = await freshModule();
    expect(firstRunDestination('none', 'routed', 'advChat')).toBe('advChat');
  });

  it('leaves the control arm exactly where it always went', async () => {
    // 'offered' must be today's behaviour, unchanged. If the control moves,
    // the experiment compares two new things and says nothing about either.
    vi.stubGlobal('localStorage', makeStorage().api);
    const { firstRunDestination } = await freshModule();
    expect(firstRunDestination('none', 'offered', 'advChat')).toBe('steps');
  });

  it('never routes a reader who holds something, in either arm', async () => {
    // The requirement that anyone with holdings sees no change at all. Demo
    // mode counts: the app is showing positions, invented or not.
    vi.stubGlobal('localStorage', makeStorage().api);
    const { firstRunDestination } = await freshModule();
    for (const variant of ['routed', 'offered', null] as const) {
      expect(firstRunDestination('demo', variant, 'advChat')).toBe('steps');
      expect(firstRunDestination('live', variant, 'advChat')).toBe('steps');
    }
  });

  it('resumes a part-finished flow rather than restarting it', async () => {
    // advStage is a monotonic high-water mark and is persisted, so a reader
    // whose remote state arrives late on a new device can reach the overlay
    // with progress already recorded. Sending them to advChat would ask four
    // questions they have answered.
    vi.stubGlobal('localStorage', makeStorage().api);
    const { firstRunDestination } = await freshModule();
    expect(firstRunDestination('none', 'routed', 'advConnect')).toBe('advConnect');
    expect(firstRunDestination('none', 'routed', 'advDash')).toBe('advDash');
  });

  it('sends an unassigned reader down the unchanged path', async () => {
    // Storage unreachable, so no arm could be recorded. Not being in the
    // experiment means getting the behaviour that predates it.
    vi.stubGlobal('localStorage', makeStorage().api);
    const { firstRunDestination } = await freshModule();
    expect(firstRunDestination('none', null, 'advChat')).toBe('steps');
  });
});
