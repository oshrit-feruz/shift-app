import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

/**
 * The socket to EODHD's US trades feed, kept open.
 *
 * What the feed promises (from its documentation, confirmed against the
 * live service in docs/eodhd-plan-decision.md): one connection per API key
 * (a second one is refused), 50 symbols per connection, an authorisation
 * frame first, then one JSON frame per trade — `{ s, p, v, t, ms, ... }` —
 * for every subscribed symbol, 04:00–20:00 New York time, from a single lit
 * exchange. Subscriptions are lost on reconnect and must be sent again,
 * which is why this class remembers what it was asked to watch and re-asks
 * on every open.
 *
 * What it does about silence: a socket that stopped delivering looks the
 * same as a quiet market, so it pings every half minute and gives up on a
 * connection that does not pong. Reconnects back off from a second to a
 * minute, so an outage on their side does not become a hammering on ours.
 */

export const US_TRADES_URL = 'wss://ws.eodhistoricaldata.com/ws/us';

export interface Trade {
  symbol: string;
  price: number;
  /** Epoch milliseconds, as the feed stamped it. */
  at: number;
  /** open | closed | extended-hours, or null when the frame did not say. */
  status: string | null;
}

export type Frame =
  { kind: 'trade'; trade: Trade } | { kind: 'status'; code: number; message: string } | { kind: 'ignore' };

/** One frame off the wire into what the worker acts on. Anything unreadable is ignored, never guessed at. */
export function parseFrame(raw: string): Frame {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { kind: 'ignore' };
  }
  if (body === null || typeof body !== 'object') return { kind: 'ignore' };
  const b = body as Record<string, unknown>;
  if (typeof b.status_code === 'number') {
    return { kind: 'status', code: b.status_code, message: typeof b.message === 'string' ? b.message : '' };
  }
  if (typeof b.s === 'string' && typeof b.p === 'number' && Number.isFinite(b.p) && b.p > 0) {
    return {
      kind: 'trade',
      trade: {
        symbol: b.s.trim().toUpperCase(),
        price: b.p,
        at: typeof b.t === 'number' && Number.isFinite(b.t) ? b.t : Date.now(),
        status: typeof b.ms === 'string' ? b.ms : null,
      },
    };
  }
  return { kind: 'ignore' };
}

/** Reconnect delay for the n-th consecutive failure: 1s, 2s, 4s … capped at a minute. */
export function backoffMs(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, Math.min(attempt, 6)));
}

/** The feed's own message shapes. */
const subscribeFrame = (symbols: string[]) =>
  JSON.stringify({ action: 'subscribe', symbols: symbols.join(',') });
const unsubscribeFrame = (symbols: string[]) =>
  JSON.stringify({ action: 'unsubscribe', symbols: symbols.join(',') });

const PING_MS = 30_000;
const PONG_GRACE_MS = 10_000;

export interface FeedEvents {
  trade: [Trade];
  status: [{ code: number; message: string }];
  open: [];
  close: [{ code: number; reason: string }];
  error: [Error];
}

/** Injectable for tests: anything with the four methods the feed uses. */
export type SocketFactory = (url: string) => WebSocket;

export class Feed extends EventEmitter<FeedEvents> {
  private socket: WebSocket | null = null;
  private readonly wanted = new Set<string>();
  private attempt = 0;
  private closedByUs = false;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  /** True once the server has answered the handshake with its authorisation frame. */
  authorized = false;
  lastTradeAt: number | null = null;

  constructor(
    private readonly url: string,
    private readonly makeSocket: SocketFactory = (u) => new WebSocket(u),
  ) {
    super();
  }

  /** The symbols the feed is asked to carry, whether or not the socket is up right now. */
  get symbols(): ReadonlySet<string> {
    return this.wanted;
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.closedByUs = false;
    this.open();
  }

  /** Close for good: no reconnect. */
  close(): void {
    this.closedByUs = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }

  subscribe(symbols: string[]): void {
    const fresh = symbols.filter((s) => !this.wanted.has(s));
    for (const s of fresh) this.wanted.add(s);
    if (fresh.length > 0 && this.connected) this.socket?.send(subscribeFrame(fresh));
  }

  unsubscribe(symbols: string[]): void {
    const gone = symbols.filter((s) => this.wanted.has(s));
    for (const s of gone) this.wanted.delete(s);
    if (gone.length > 0 && this.connected) this.socket?.send(unsubscribeFrame(gone));
  }

  private open(): void {
    this.authorized = false;
    const socket = this.makeSocket(this.url);
    this.socket = socket;

    socket.on('open', () => {
      this.attempt = 0;
      // Subscriptions do not survive a reconnect: ask again for everything.
      if (this.wanted.size > 0) socket.send(subscribeFrame([...this.wanted]));
      this.startPing(socket);
      this.emit('open');
    });
    socket.on('message', (data) => {
      const frame = parseFrame(data.toString());
      if (frame.kind === 'trade') {
        this.lastTradeAt = Date.now();
        this.emit('trade', frame.trade);
      } else if (frame.kind === 'status') {
        if (frame.code === 200) this.authorized = true;
        this.emit('status', { code: frame.code, message: frame.message });
      }
    });
    socket.on('pong', () => {
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = null;
    });
    socket.on('error', (err) => {
      this.emit('error', err);
    });
    socket.on('close', (code, reason) => {
      this.clearTimers();
      this.authorized = false;
      this.emit('close', { code, reason: reason.toString() });
      if (this.closedByUs) return;
      const delay = backoffMs(this.attempt);
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    });
  }

  private startPing(socket: WebSocket): void {
    this.pingTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.ping();
      this.pongTimer = setTimeout(() => {
        // No pong: the connection is gone whatever the OS thinks. Terminate
        // rather than close, so the 'close' handler reconnects at once
        // instead of waiting on a handshake that will never complete.
        socket.terminate();
      }, PONG_GRACE_MS);
    }, PING_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.pongTimer = null;
    this.reconnectTimer = null;
  }
}
