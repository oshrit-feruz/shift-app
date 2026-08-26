import { describe, expect, it } from 'vitest';
import { ADV_ORDER, setupProgress, type AppState } from './appState';

const base: AppState = {
  screen: 'home',
  ticker: 'NVDA',
  advAnswers: [],
  advStage: 0,
  advBroker: null,
  advConnections: {},
  advSolo: false,
  watchlist: [],
  firstRunSeen: true,
  stepsDone: {},
  fromSteps: false,
  alertUpThreshold: '',
  alertDownThreshold: '',
  notificationsRead: false,
  pfIndex: 0,
  aggExcluded: {},
  manualTxs: [],
  manualPortfolios: [],
};

describe('setupProgress resume guard', () => {
  it('never resumes past the chat without a complete answer set', () => {
    // Stale/partial persisted state: stage says "recommendation reached" but
    // the answers that determine the profile are missing.
    const s = { ...base, advStage: 3, advAnswers: [] };
    expect(setupProgress(s).resumeScreen).toBe('advChat');
  });

  it('never resumes past the chat with a partial answer set', () => {
    const s = { ...base, advStage: 4, advAnswers: [2, 3] as AppState['advAnswers'] };
    expect(setupProgress(s).resumeScreen).toBe('advChat');
  });

  it('resumes at the recorded stage when the profile is determined', () => {
    const s = { ...base, advStage: 2, advAnswers: [2, 3, 3, 2] as AppState['advAnswers'] };
    expect(setupProgress(s).resumeScreen).toBe(ADV_ORDER[2]);
  });
});
