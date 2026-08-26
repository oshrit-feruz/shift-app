/** Domain types shared by the data service and the UI. */

export interface SymbolInfo {
  ticker: string;
  name: string;
  price: number;
  changePct: number; // day change, signed
  volume: string;
  marketCap: string;
  pe: number;
  rsi: number;
  sector: string;
  /** Beginner-mode plain-language description (per language). */
  plain: { en: string; he: string };
  /** Beginner-mode "why it moved" line (per language). */
  why: { en: string; he: string };
}

/**
 * A position currently held by the Recovery Detector engine.
 * Prices are nullable on purpose: this comes from a live API whose rows may
 * omit a numeric field, and an absent price renders as "—" rather than being
 * guessed or back-filled (see data/recoveryDetector.ts).
 */
export interface SatellitePosition {
  ticker: string;
  entryPrice: number | null;
  currentPrice: number | null;
}

export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  value: number;
  plPct: number;
}

export type PortfolioKind = 'aggregate' | 'linked' | 'manual' | 'institution';

export interface PortfolioSummary {
  id: string;
  kind: PortfolioKind;
  name: string;
  broker: string | null;
  logo: string | null;
  acct: string;
  syncedAgo: { en: string; he: string } | null;
  total: number;
  dayPct: number;
  allTimePct: number;
  /** institution kind label key suffix: 'pension' | 'hisht' | 'bank' */
  institution?: 'pension' | 'hisht' | 'bank';
}

export interface AllocationSlice {
  label: string;
  pct: number;
  colorVar: string; // CSS var reference, e.g. 'var(--color-accent)'
}

export interface NewsItem {
  time: string;
  source: string;
  ticker: string;
  headline: string;
  tag: string;
  changePct: number;
  summary: string;
}

export interface EarningsEvent {
  date: string; // e.g. 'Mon 25'
  when: 'AMC' | 'BMO';
  ticker: string;
  name: string;
  epsEst: string;
  impliedMove: string;
}

export interface ActiveAlert {
  glyph: string;
  title: { en: string; he: string };
  detail: { en: string; he: string };
}

export interface AppNotification {
  glyph: string;
  title: { en: string; he: string };
  detail: { en: string; he: string };
  ago: { en: string; he: string };
  ticker: string;
  unread: boolean;
  /** Threshold alerts are informational-only and render with the fixed disclaimer. */
  isThresholdAlert?: boolean;
}

export interface InstitutionProvider {
  name: { en: string; he: string };
  logo: string | null;
}

export interface InstitutionKind {
  key: 'broker' | 'bank' | 'pension' | 'hisht';
  initial: { en: string; he: string };
  providers: InstitutionProvider[];
}

export interface BrokerOption {
  key: 'blink' | 'ibkr' | 'colmex';
  name: string;
  logo: string;
  help: { en: string; he: string };
}

export interface LongTermAccount {
  key: 'pension' | 'hisht' | 'bank';
  total: number;
  ytdPct: number | null;
}

/**
 * Honest async state. UI must render all three shapes — never substitute a
 * fabricated number for 'loading' or 'unavailable'.
 */
export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ok'; data: T };

export const loading = <T,>(): Loadable<T> => ({ status: 'loading' });
export const unavailable = <T,>(): Loadable<T> => ({ status: 'unavailable' });
export const ok = <T,>(data: T): Loadable<T> => ({ status: 'ok', data });
