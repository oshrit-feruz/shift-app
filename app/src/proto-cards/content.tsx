import type { ReactNode } from 'react';
import { AreaChart } from '../components/AreaChart';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { ProgressTrack } from '../components/Progress';
import { TickerTile } from '../components/TickerTile';

/**
 * The screen the variants all render — one Home, same numbers, same copy, so
 * the only thing that changes between variants is the surface treatment.
 * Copy is lifted from i18n/strings.ts; figures match the demo adapter's
 * shape. Nothing here decides anything about the surface: padding, fill,
 * border, shadow and motion all belong to the variant that wraps it.
 */

type Quote = { t: string; name: string; price: string; chg: number };

export const WATCHED: Quote[] = [
  { t: 'NVDA', name: 'NVIDIA', price: '$174.32', chg: 1.94 },
  { t: 'AAPL', name: 'Apple', price: '$232.05', chg: 0.42 },
  { t: 'TEVA', name: 'Teva', price: '$18.77', chg: -1.16 },
];

export const MOVERS: Quote[] = [
  { t: 'AMD', name: 'Advanced Micro', price: '$149.88', chg: 4.31 },
  { t: 'TSLA', name: 'Tesla', price: '$401.20', chg: -2.87 },
  { t: 'META', name: 'Meta', price: '$612.40', chg: 1.55 },
];

/** A deterministic drift, so the chart is the same shape on every variant. */
export const SERIES = (() => {
  let v = 100;
  let seed = 20260831;
  return Array.from({ length: 60 }, () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    v += (seed / 2147483648 - 0.42) * 2.2;
    return v;
  });
})();

const sign = (n: number) => (n >= 0 ? 'var(--up)' : 'var(--down)');
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export function HeroBody() {
  return (
    <>
      <div style={{ fontSize: 'var(--text-title)', opacity: 0.75, fontWeight: 600 }}>
        Your portfolio today
      </div>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-hero)',
          letterSpacing: 'var(--track-hero)',
          lineHeight: 'var(--lead-hero)',
          fontWeight: 700,
        }}
      >
        <Num>$48,214</Num>
      </div>
      <div style={{ color: 'var(--up)', fontSize: 'var(--text-title)', fontWeight: 600 }}>
        <Num weight={600}>+$412.60 (+0.86%) today</Num>
      </div>
      <div style={{ marginTop: 10 }}>
        <AreaChart values={SERIES} height={76} />
      </div>
      <p
        style={{
          fontSize: 'var(--text-row)',
          lineHeight: 1.5,
          margin: '10px 0 0',
          opacity: 0.85,
          fontWeight: 500,
        }}
      >
        Most of today's gain came from NVDA, your largest holding. One day rarely means much — the months are
        what matter.
      </p>
    </>
  );
}

export function SetupBody() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>Complete your setup</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--color-accent-200)', fontSize: 'var(--text-row)' }}>Continue ›</span>
      </div>
      <ProgressTrack pct={60} label="Step 3 of 5" />
    </>
  );
}

export function SectionHead({ title, action }: { title: string; action?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 'var(--text-title)', fontWeight: 600, flex: 1 }}>{title}</span>
      {action && (
        <span style={{ color: 'var(--color-accent-300)', fontSize: 'var(--text-row)' }}>{action}</span>
      )}
    </div>
  );
}

export function Help({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted" style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

/** One quote row. `ruled` draws the hairline a variant with no pane needs. */
export function QuoteRow({ q, ruled }: { q: Quote; ruled?: boolean }) {
  return (
    <div
      className="tap p-row"
      data-ruled={ruled ? '' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <TickerTile ticker={q.t} size={34} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 'var(--text-row)', fontWeight: 600 }}>
          <Num>{q.t}</Num>
        </span>
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {q.name}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <Num weight={600} size="var(--text-row)">
          {q.price}
        </Num>
        <Num color={sign(q.chg)} weight={600} size="var(--text-caption)">
          {pct(q.chg)}
        </Num>
      </div>
    </div>
  );
}

export function WatchRows({ ruled }: { ruled?: boolean }) {
  return (
    <>
      {WATCHED.map((q) => (
        <QuoteRow key={q.t} q={q} ruled={ruled} />
      ))}
    </>
  );
}

export function MoverRows({ ruled }: { ruled?: boolean }) {
  return (
    <>
      {MOVERS.map((q) => (
        <QuoteRow key={q.t} q={q} ruled={ruled} />
      ))}
    </>
  );
}

export function AllMovers() {
  return (
    <span style={{ color: 'var(--color-accent-300)', fontSize: 'var(--text-row)', fontWeight: 500 }}>
      All market movers →
    </span>
  );
}

export function TrendBadge() {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        flex: 'none',
        borderRadius: 8,
        background: 'var(--sunk)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--color-accent-200)',
      }}
      aria-hidden="true"
    >
      <Icon name="trend" size={14} />
    </span>
  );
}
