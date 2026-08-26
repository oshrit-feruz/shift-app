/**
 * Broker hand-off links.
 *
 * Shift never places an order. Every link here opens the broker's own site,
 * where the customer places the trade themselves — that hand-off is what keeps
 * the flow "information only" rather than execution, and it is the reason the
 * buttons say "buy at <broker>" and never "buy".
 */

export type BrokerKey = 'blink' | 'ibkr' | 'colmex';

export const BROKER_NAMES: Record<BrokerKey, string> = {
  blink: 'Blink',
  ibkr: 'Interactive Brokers',
  colmex: 'Colmex Pro',
};

/** Account-opening / referral pages. */
export const BROKER_URLS: Record<BrokerKey, string> = {
  blink: 'https://heyblink.com/',
  ibkr: 'https://www.interactivebrokers.com/en/accounts/individual.php',
  colmex: 'https://my.colmexpro.com/signup?lang=he',
};

/**
 * Per-symbol trade deep links — one URL builder per broker.
 *
 * DELIBERATELY EMPTY, and not an oversight. A deep link that 404s, lands on a
 * marketing page, or resolves to the wrong instrument is worse than no link at
 * all, because the customer may act on it. Nothing is guessed here: each entry
 * stays null until the real URL shape is confirmed with that broker, and note
 * that plenty of retail brokers expose no public per-symbol order URL, so for
 * some of these the confirmed answer may be "there isn't one".
 *
 * Until an entry is filled in, `resolveTrade` degrades to the broker's own
 * site with the ticker copied to the clipboard — a hand-off that is honest
 * about what it can and cannot do.
 *
 * Example of what a filled entry looks like:
 *   ibkr: (ticker) => `https://example-broker.com/trade?symbol=${encodeURIComponent(ticker)}`,
 */
export const BROKER_TRADE_URL: Record<BrokerKey, ((ticker: string) => string) | null> = {
  blink: null,
  ibkr: null,
  colmex: null,
};

export interface TradeTarget {
  url: string;
  /** True when the URL points at the instrument, false when it is the broker's site. */
  deepLinked: boolean;
}

/** Where the "buy at broker" button should send the customer for one ticker. */
export function resolveTrade(broker: BrokerKey, ticker: string): TradeTarget {
  const build = BROKER_TRADE_URL[broker];
  if (build) return { url: build(ticker), deepLinked: true };
  return { url: BROKER_URLS[broker], deepLinked: false };
}

/** True when every broker still lacks a per-symbol link, so the UI can say so. */
export function hasAnyTradeDeepLink(): boolean {
  return Object.values(BROKER_TRADE_URL).some((build) => build !== null);
}

/**
 * Fund strings are stored as "Long Fund Name · TICKER" (see lib/advisory.ts).
 * Returns the ticker, or null when the string carries no separator — the
 * caller then has nothing to trade and should not offer a button.
 */
export function fundTicker(fund?: string): string | null {
  if (!fund) return null;
  const parts = fund.split('·');
  if (parts.length < 2) return null;
  const ticker = parts[parts.length - 1].trim();
  return ticker === '' ? null : ticker;
}

/**
 * Opens the broker hand-off. The ticker is copied first so that when the link
 * is only the broker's site (no per-symbol URL confirmed yet) the customer
 * still has the symbol ready to paste into the broker's own search.
 *
 * Clipboard access can be denied or unavailable; that must never block the
 * navigation, so it is best-effort.
 */
export async function openTrade(broker: BrokerKey, ticker: string): Promise<TradeTarget> {
  const target = resolveTrade(broker, ticker);
  try {
    await navigator.clipboard?.writeText(ticker);
  } catch {
    /* best-effort only */
  }
  window.open(target.url, '_blank', 'noopener,noreferrer');
  return target;
}
