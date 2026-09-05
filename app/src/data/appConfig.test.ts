import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The kill switch, and the one property that matters more than the others:
 * every way it can fail has to read as OFF.
 *
 * The asymmetry is the whole point. Off is the app's behaviour before PR 2;
 * on is a routing change to the first screen a new user sees. So a config
 * that cannot be read must not be able to enable the new flow — otherwise an
 * outage ships a change nobody approved, and it ships it to exactly the
 * people the switch exists to protect. Every case below is a different way of
 * not getting an answer, and every one of them asserts false.
 *
 * Each case imports the module fresh: the flag lives at module scope, read
 * once per page load by design.
 */

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

let client: unknown = { from };

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return client;
  },
}));

async function freshModule() {
  vi.resetModules();
  return import('./appConfig');
}

afterEach(() => {
  client = { from };
  vi.clearAllMocks();
});

describe('before any answer', () => {
  it('is off, so the first render routes the way it always did', async () => {
    const { entryExperimentEnabled } = await freshModule();
    expect(entryExperimentEnabled()).toBe(false);
  });

  it('is off while the read is still in flight', async () => {
    // The realistic race: the overlay is reachable before the fetch lands.
    let settle: (v: unknown) => void = () => {};
    maybeSingle.mockReturnValue(new Promise((r) => (settle = r)));
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    const pending = loadAppConfig();
    expect(entryExperimentEnabled()).toBe(false);

    settle({ data: { entry_experiment_enabled: true }, error: null });
    await pending;
    expect(entryExperimentEnabled()).toBe(true);
  });
});

describe('a real answer', () => {
  it('turns the experiment on when the row says true', async () => {
    maybeSingle.mockResolvedValue({ data: { entry_experiment_enabled: true }, error: null });
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await loadAppConfig();

    expect(entryExperimentEnabled()).toBe(true);
    expect(from).toHaveBeenCalledWith('app_config');
  });

  it('leaves it off when the row says false', async () => {
    maybeSingle.mockResolvedValue({ data: { entry_experiment_enabled: false }, error: null });
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await loadAppConfig();

    expect(entryExperimentEnabled()).toBe(false);
  });

  it('treats a non-boolean as off rather than as truthy', async () => {
    // A column read back as a string is not a yes. `=== true` is what keeps
    // 'false', '0' and 'off' from all enabling the flow.
    maybeSingle.mockResolvedValue({ data: { entry_experiment_enabled: 'false' }, error: null });
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await loadAppConfig();

    expect(entryExperimentEnabled()).toBe(false);
  });
});

describe('every way of not getting an answer', () => {
  it('is off when Supabase is not configured', async () => {
    client = null;
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await loadAppConfig();

    expect(entryExperimentEnabled()).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('is off when the query returns an error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await loadAppConfig();

    expect(entryExperimentEnabled()).toBe(false);
  });

  it('is off when the row is missing entirely', async () => {
    // maybeSingle returns null data rather than throwing. A config with no row
    // is a config that cannot be read, not a default of "on".
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await loadAppConfig();

    expect(entryExperimentEnabled()).toBe(false);
  });

  it('is off, and does not reject, when the request throws', async () => {
    maybeSingle.mockRejectedValue(new Error('network down'));
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await expect(loadAppConfig()).resolves.toBeUndefined();
    expect(entryExperimentEnabled()).toBe(false);
  });

  it('is off when the client itself throws on use', async () => {
    client = {
      from() {
        throw new Error('client exploded');
      },
    };
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();

    await expect(loadAppConfig()).resolves.toBeUndefined();
    expect(entryExperimentEnabled()).toBe(false);
  });
});

describe('a second read', () => {
  it('takes the newer answer, in both directions', async () => {
    // Stated because the opposite is easy to assume: this does not latch. It
    // holds the last successful answer. What keeps the value stable across the
    // one moment it is consumed is that main.tsx calls loadAppConfig exactly
    // once per page load, not any latching here.
    maybeSingle.mockResolvedValue({ data: { entry_experiment_enabled: true }, error: null });
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();
    await loadAppConfig();
    expect(entryExperimentEnabled()).toBe(true);

    maybeSingle.mockResolvedValue({ data: { entry_experiment_enabled: false }, error: null });
    await loadAppConfig();
    expect(entryExperimentEnabled()).toBe(false);
  });

  it('does not let a FAILED read turn a live flag off', async () => {
    maybeSingle.mockResolvedValue({ data: { entry_experiment_enabled: true }, error: null });
    const { entryExperimentEnabled, loadAppConfig } = await freshModule();
    await loadAppConfig();

    maybeSingle.mockRejectedValue(new Error('network down'));
    await loadAppConfig();

    expect(entryExperimentEnabled()).toBe(true);
  });
});
