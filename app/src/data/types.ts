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
 * A candidate surfaced by the Recovery Detector screener.
 * Every number is nullable on purpose: this comes from a live API whose rows
 * may omit a field, and an absent number renders as "—" rather than being
 * guessed or back-filled (see data/recoveryDetector.ts).
 */
export interface SatelliteSignal {
  ticker: string;
  /** Last price the engine saw. */
  price: number | null;
  /** 52-week high the drawdown is measured against. */
  high52w: number | null;
  /** How far below the 52-week high, in percent (positive = below). */
  drawdownPct: number | null;
  /** The engine's 0..1 composite ranking score. */
  compositeScore: number | null;
  /** The engine's verdict; null when it sent something we don't recognise. */
  signal: 'BUY' | 'WATCH' | 'SKIP' | null;
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
  /** The full story behind the headline, shown when a card is opened. */
  body: string;
}

export interface EarningsEvent {
  date: string; // e.g. 'Mon 25'
  when: 'AMC' | 'BMO';
  ticker: string;
  name: string;
  mktCap: string;
  epsEst: string;
  revEst: string;
  impliedMove: string;
  /** Signed surprise from the company's last reported quarter, e.g. '+8.1%'. */
  lastSurprise: string;
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
  /**
   * `reason` is an optional, already-human-readable explanation of *why* this
   * is unavailable — e.g. "the snapshot is 9 days old". It is shown to the
   * user in place of the generic help text, so it must never carry a raw
   * error string or anything a caller would have to interpret. Omit it and
   * the generic copy is used, which is right for the common case where the
   * only honest thing to say is "we could not load this".
   *
   * Bilingual for the same reason PortfolioSummary.syncedAgo is: this text
   * reaches a Hebrew-first UI, and the data layer has no access to the
   * i18n hooks, so it carries both languages and the component picks one.
   */
  | { status: 'unavailable'; reason?: { en: string; he: string } }
  | { status: 'ok'; data: T };

export const loading = <T,>(): Loadable<T> => ({ status: 'loading' });
export const unavailable = <T,>(reason?: { en: string; he: string }): Loadable<T> => ({
  status: 'unavailable',
  reason,
});
export const ok = <T,>(data: T): Loadable<T> => ({ status: 'ok', data });
