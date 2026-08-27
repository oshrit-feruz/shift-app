/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Alpaca paper-trading API key ID, used client-side to authenticate the
   * live IEX price WebSocket (see src/data/alpacaLive.ts). MUST be a
   * paper-account key pair, never a live-trading one — this value is
   * visible in the browser.
   */
  readonly VITE_ALPACA_KEY_ID?: string;
  readonly VITE_ALPACA_SECRET_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
