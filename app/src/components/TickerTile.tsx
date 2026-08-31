/** Ticker logo tile — real logo where an asset exists, monogram fallback.
 *  One place maps tickers to logo files. */

const LOGOS: Record<string, string> = {
  NVDA: '/assets/sym-nvda.svg',
  AAPL: '/assets/sym-aapl.svg',
  MSFT: '/assets/sym-msft.svg',
  GOOGL: '/assets/sym-googl.svg',
  META: '/assets/sym-meta.svg',
  AMZN: '/assets/sym-amzn.svg',
  TSLA: '/assets/sym-tsla.svg',
  AVGO: '/assets/sym-avgo.svg',
  JPM: '/assets/sym-jpm.svg',
  LLY: '/assets/sym-lly.svg',
  XOM: '/assets/sym-xom.svg',
  UNH: '/assets/sym-unh.svg',
  COST: '/assets/sym-cost.svg',
  JNJ: '/assets/sym-jnj.svg',
  WMT: '/assets/sym-wmt.svg',
  V: '/assets/sym-v.svg',
  MA: '/assets/sym-ma.svg',
  NFLX: '/assets/sym-nflx.svg',
  TEVA: '/assets/sym-teva.webp',
  MDA: '/assets/sym-mda.webp',
  AMD: '/assets/sym-amd.webp',
};

export function TickerTile({ ticker, size = 34 }: { ticker: string; size?: number }) {
  const url = LOGOS[ticker];
  const base = {
    width: size,
    height: size,
    flex: 'none',
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center' as const,
    fontSize: size < 30 ? 12 : 'var(--text-micro)',
    fontWeight: 600,
  };
  if (url) {
    // A real <img>, not background-image: it gets viewport-lazy loading and
    // async decode, which CSS backgrounds have no equivalent for.
    return (
      <span style={{ ...base, backgroundColor: '#fff', overflow: 'hidden' }}>
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '74%', height: '74%', objectFit: 'contain' }}
        />
      </span>
    );
  }
  return (
    <span style={{ ...base, background: 'var(--tile-ground)', color: 'var(--color-accent-200)' }}>
      {ticker.slice(0, 2)}
    </span>
  );
}

/** Small square logo tile for brokers/providers (white ground, contain-fit). */
export function LogoTile({
  src,
  size = 32,
  dashed = false,
  label,
}: {
  src: string | null;
  size?: number;
  dashed?: boolean;
  label?: string;
}) {
  if (!src) {
    return (
      <span
        style={{
          width: size,
          height: size,
          flex: 'none',
          borderRadius: 7,
          border: dashed ? '1px dashed var(--muted)' : undefined,
          background: dashed ? 'transparent' : 'var(--tile-ground)',
          color: dashed ? 'var(--muted)' : 'var(--color-accent-200)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 'var(--text-micro)',
          letterSpacing: 'var(--track-micro)',
          lineHeight: 'var(--lead-micro)',
          fontWeight: 600,
        }}
      >
        {label ?? ''}
      </span>
    );
  }
  // Same <img> treatment as TickerTile: lazy + async decode.
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 7,
        backgroundColor: '#fff',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </span>
  );
}
