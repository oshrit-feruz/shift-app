import { describe, expect, it } from 'vitest';
import { deletable } from './Portfolio';
import type { PortfolioSummary } from '../data/types';

const pf = (over: Partial<PortfolioSummary>): PortfolioSummary => ({
  id: 'pf-1',
  kind: 'manual',
  name: 'Sandbox',
  broker: null,
  logo: null,
  acct: '',
  syncedAgo: null,
  total: 0,
  dayPct: null,
  allTimePct: null,
  ...over,
});

describe('deletable', () => {
  // The whole point of 0010: the Sandbox is ordinary user content now. This
  // rule was silently reverted once by a merge that took another branch's
  // copy of the component, so it is asserted rather than trusted.
  it('offers a delete on the Sandbox, which 0010 made deletable', () => {
    expect(deletable(pf({ id: 'pf-sandbox-u1', name: 'Sandbox' }))).toBe(true);
  });

  it('offers a delete on any other manual portfolio', () => {
    expect(deletable(pf({ id: 'manual-2', name: 'Growth' }))).toBe(true);
  });

  // A linked account is disconnected, not deleted — a different act on a
  // different thing, and revocable() decides it.
  it('does not offer a delete on a linked account or the aggregate', () => {
    expect(deletable(pf({ kind: 'linked' }))).toBe(false);
    expect(deletable(pf({ kind: 'aggregate' }))).toBe(false);
  });
});
