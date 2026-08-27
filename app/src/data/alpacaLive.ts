/**
 * LIVE price stream — Alpaca's IEX real-time trade feed, connected to
 * directly from the browser over WebSocket.
 *
 * WHY THE BROWSER CONNECTS DIRECTLY, NOT A SERVER PROXY: a WebSocket needs a
 * process that stays alive to hold the connection. Vercel functions are
 * invocation-scoped and can't do that, and the free tier this app already
 * depends on for the Recovery Detector engine (Render) sleeps after ~15
 * minutes idle — see recoveryDetector.ts. A server relay would need an
 * always-on host, which has no free option that fits this project. The
 * browser holding the connection while the tab is open needs nothing beyond
 * this file.
 *
 * WHY THIS IS "LIVE" BUT NOT "THE" PRICE: Alpaca's free tier streams IEX
 * only — one exchange, not the consolidated tape every other exchange also
 * trades on. For a liquid ticker (NVDA, AAPL, ...) IEX prints on nearly
 * every trade and tracks the consolidated price closely; for a thin ticker
 * it can lag or gap. This is a real trade the instant it happens, not a
 * delayed quote — but it is not necessarily the same print your broker
 * shows. The UI must say "IEX" wherever it shows a live price, not just
 * "live" (see live.iexNote in strings.ts) — that is the data-honesty
 * contract this app holds everywhere else, applied here too.
 *
 * WHY KEY+SECRET IN A VITE_ ENV VAR: unlike EODHD_API_KEY (proxied server-side
 * in api/news.ts because it must never reach the browser), Alpaca's
 * WebSocket auth happens from the client by design — there is no server in
 * this loop to hold the secret instead. This means the key pair is visible
 * to anyone who opens devtools. That is only acceptable because these must
 * be PAPER-TRADING keys: a leaked pair grants full access to the paper
 * account's Trading API (market data, account/position reads, placing
 * orders), but there is no real money or real order routing behind any of
 * it. NEVER put a live-trading key pair here. See README.
 */

export type LiveTrade = { ticker: string; price: number; ts: number };

export type ConnectionStatus =
  /** No alert needs a live price right now, or the last subscriber just left. */
  | 'idle'
  | 'connecting'
  | 'open'
  | 'error'
  /** VITE_ALPACA_KEY_ID / VITE_ALPACA_SECRET_KEY are not set. */
  | 'unconfigured';

type TradeListener = (t: LiveTrade) => void;
type StatusListener = (s: ConnectionStatus) => void;

const ALPACA_IEX_WS_URL = 'wss://stream.data.alpaca.markets/v2/iex';
/** Fixed backoff on an unexpected close while alerts still need the feed. */
const RECONNECT_DELAY_MS = 3000;

/**
 * One shared connection for the whole app: every alert on every ticker rides
 * the same socket rather than opening one per screen, which is both what
 * Alpaca's API expects (a single subscribe list per connection) and what
 * keeps a rapid symbol switch from opening a new socket per keystroke.
 */
class AlpacaLiveFeed {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private authed = false;
  /**
   * Ticker -> number of live subscribe() callers still watching it (a
   * refcount, not membership). Two components can both want NVDA at once —
   * e.g. AlertSheet's live-price preview and PriceAlertWatcher's saved
   * alert — and the first to unsubscribe must not rip the ticker out from
   * under the other.
   */
  private readonly subscribed = new Map<string, number>();
  private readonly tradeListeners = new Set<TradeListener>();
  private readonly statusListeners = new Set<StatusListener>();

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onTrade(listener: TradeListener): () => void {
    this.tradeListeners.add(listener);
    return () => this.tradeListeners.delete(listener);
  }

  /** Calls back immediately with the current status, then on every change. */
  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  subscribe(ticker: string): void {
    const count = this.subscribed.get(ticker) ?? 0;
    this.subscribed.set(ticker, count + 1);
    this.ensureConnected();
    if (count === 0) this.sendSubscribe([ticker]);
  }

  unsubscribe(ticker: string): void {
    const count = this.subscribed.get(ticker);
    if (count == null) return;
    if (count > 1) {
      this.subscribed.set(ticker, count - 1);
      return;
    }
    this.subscribed.delete(ticker);
    if (this.ws && this.authed) {
      this.ws.send(JSON.stringify({ action: 'unsubscribe', trades: [ticker] }));
    }
    if (this.subscribed.size === 0) {
      this.ws?.close();
    }
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }

  private sendSubscribe(tickers: string[]): void {
    if (this.ws && this.authed) {
      this.ws.send(JSON.stringify({ action: 'subscribe', trades: tickers }));
    }
    // Not yet authed: the open handler resubscribes the full set once auth
    // succeeds (see handleMessage), so nothing to do here.
  }

  private ensureConnected(): void {
    if (this.ws) return;
    // Guards the delayed-reconnect path too: onclose schedules this call
    // 3s out, and every subscriber can have unsubscribed by the time it
    // fires. Without this check that timer would still open a fresh socket
    // with nothing left to close it.
    if (this.subscribed.size === 0) {
      this.setStatus('idle');
      return;
    }

    const key = import.meta.env.VITE_ALPACA_KEY_ID as string | undefined;
    const secret = import.meta.env.VITE_ALPACA_SECRET_KEY as string | undefined;
    if (!key || !secret) {
      this.setStatus('unconfigured');
      return;
    }

    this.setStatus('connecting');
    const ws = new WebSocket(ALPACA_IEX_WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: 'auth', key, secret }));
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onerror = () => this.setStatus('error');
    ws.onclose = () => {
      this.ws = null;
      this.authed = false;
      if (this.subscribed.size > 0) {
        // An alert is still waiting on this ticker — reconnect rather than
        // silently going quiet, which would make an alert look armed while
        // it can never fire again.
        this.setStatus('connecting');
        setTimeout(() => this.ensureConnected(), RECONNECT_DELAY_MS);
      } else {
        this.setStatus('idle');
      }
    };
  }

  private handleMessage(raw: string): void {
    let messages: unknown;
    try {
      messages = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(messages)) return;

    for (const m of messages) {
      if (typeof m !== 'object' || m === null) continue;
      const msg = m as Record<string, unknown>;
      if (msg.T === 'success' && msg.msg === 'authenticated') {
        this.authed = true;
        this.setStatus('open');
        if (this.subscribed.size > 0) this.sendSubscribe([...this.subscribed.keys()]);
      } else if (msg.T === 'error') {
        console.error('Alpaca stream error:', msg.msg);
        this.setStatus('error');
      } else if (msg.T === 't' && typeof msg.S === 'string' && typeof msg.p === 'number') {
        this.tradeListeners.forEach((l) => l({ ticker: msg.S as string, price: msg.p as number, ts: Date.now() }));
      }
    }
  }
}

export const alpacaLiveFeed = new AlpacaLiveFeed();
