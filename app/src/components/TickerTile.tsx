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
  TEVA: '/assets/sym-teva.png',
  MDA: '/assets/sym-mda.png',
  AMD: '/assets/sym-amd.png',
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
    fontSize: size < 30 ? 9 : 10.5,
    fontWeight: 'var(--fw-semibold)',
  };
  if (url) {
    return (
      <span
        style={{
          ...base,
          backgroundColor: 'var(--color-logo-bg)',
          backgroundImage: `url(${url})`,
          backgroundSize: '74%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
    );
  }
  return (
    <span style={{ ...base, background: 'var(--color-accent-900)', color: 'var(--color-accent-200)' }}>
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
          borderRadius: 'var(--radius-ghost)',
          border: dashed ? '1px dashed var(--muted)' : undefined,
          background: dashed ? 'transparent' : 'var(--color-accent-900)',
          color: dashed ? 'var(--muted)' : 'var(--color-accent-200)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 'var(--fs-2xs)',
          fontWeight: 'var(--fw-semibold)',
        }}
      >
        {label ?? ''}
      </span>
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 'var(--radius-ghost)',
        backgroundColor: 'var(--color-logo-bg)',
        backgroundImage: `url(${src})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
