import { useState } from 'react';
import { AllocationBar, ALLOC_COLORS, SegmentBar } from '../components/AllocationBar';
import { AreaChart, Sparkline } from '../components/AreaChart';
import { Button } from '../components/Button';
import { CandleChart } from '../components/CandleChart';
import { Card, CardTitle, Divider } from '../components/Card';
import { ChatBubble } from '../components/ChatBubble';
import { Chip, ChipRail } from '../components/Chip';
import { DataState, EmptyState } from '../components/DataState';
import { DonutChart } from '../components/DonutChart';
import { Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { IconTile } from '../components/IconTile';
import { ListRow, RowValues } from '../components/ListRow';
import { MetricStrip } from '../components/MetricStrip';
import { Num } from '../components/Num';
import { OptionCard } from '../components/OptionCard';
import { ProgressDots, ProgressTrack, SegmentDots } from '../components/Progress';
import { SegmentedControl } from '../components/SegmentedControl';
import { Sheet } from '../components/Sheet';
import { Tag } from '../components/Tag';
import { TickerTile } from '../components/TickerTile';
import { Toggle } from '../components/Toggle';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The living design-system reference — a port of "Shift Design System.dc.html"
 * that renders the REAL component library against the REAL tokens.css, so it
 * can never drift from the app: change a token or a component and this page
 * changes with it.
 */
export function DesignSystemPage() {
  const { setTheme, theme } = useTheme();
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '56px 64px 90px',
        background: 'radial-gradient(90% 55% at 18% -12%, var(--g1) 0%, var(--g2) 60%)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        boxSizing: 'border-box',
      }}
      dir="ltr"
    >
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 64 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <img src="/assets/shift-wordmark.svg" alt="Shift" style={{ height: 30, width: 'auto', display: 'block' }} />
          <Kicker>Design system</Kicker>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-num-xl)', lineHeight: 1.04, letterSpacing: '-.02em', fontWeight: 'var(--fw-semibold)', maxWidth: '16ch', whiteSpace: 'normal' }}>
            The tokens and parts behind Shift
          </h1>
          <p style={{ margin: 0, maxWidth: '60ch', fontSize: 'var(--fs-lg)', lineHeight: 1.6, color: 'var(--muted)' }}>
            Every value here is read live from tokens.css and rendered with the shipping component library — the same
            code the app itself composes from. Dark is the default surface; light mode swaps the ramp but keeps cards
            dark on purpose, so contrast against the page stays high in both.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <a
              href="/"
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-divider)', color: 'var(--acc-pale)', fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)' }}
            >
              Mobile app →
            </a>
            <Button variant="secondary" minHeight={0} fontSize={14} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              Toggle theme (now: {theme})
            </Button>
          </div>
        </div>

        {/* 01 — Color */}
        <Section n="01" title="Color" note="tokens.css · dark default, light overrides">
          <SubTitle>Surfaces</SubTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12 }}>
            <Swatch varName="--color-bg" hexNote="#0F172A / #F1F5F9" />
            <Swatch varName="--g1" hexNote="gradient top" />
            <Swatch varName="--color-surface" hexNote="glass card fill" />
            <Swatch varName="--sunk" hexNote="sunken fills" />
          </div>
          <SubTitle>Accent ramp — violet (indigo in light)</SubTitle>
          <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
            {(
              [
                ['--color-accent-200', '200'],
                ['--color-accent-300', '300'],
                ['--color-accent', 'accent'],
                ['--color-accent-700', '700'],
                ['--color-accent-800', '800'],
              ] as const
            ).map(([v, label]) => (
              <div key={v} style={{ flex: 1, padding: '20px 14px 16px', background: `var(${v})`, display: 'flex', flexDirection: 'column', gap: 32 }}>
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', color: label === '200' || label === '300' ? 'var(--g1)' : 'var(--color-on-accent)' }}>{label}</span>
                <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'ui-monospace, monospace', color: label === '200' || label === '300' ? 'var(--color-accent-800)' : 'var(--color-accent-200)' }}>{v}</span>
              </div>
            ))}
          </div>
          <Note>
            800 backs icon tiles and pills. 300 carries interactive text. --color-accent-900 is the accent at 14% alpha
            and is the only accent fill used behind body copy.
          </Note>
          <SubTitle>Signal — up / down</SubTitle>
          <Note>
            Three intensities ship behind the data-signal attribute so the same screens can be read by users who find
            saturated red/green stressful.
          </Note>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 640 }}>
            {(['vivid', 'balanced', 'muted'] as const).map((sig) => (
              <div key={sig} data-signal={sig === 'vivid' ? undefined : sig} style={{ padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <Kicker>{sig}</Kicker>
                <Num size={20} weight={600} style={{ color: 'var(--up)' }}>
                  +0.86%
                </Num>
                <Num size={20} weight={600} style={{ color: 'var(--down)' }}>
                  −1.24%
                </Num>
              </div>
            ))}
          </div>
        </Section>

        {/* 02 — Type */}
        <Section n="02" title="Type" note="Rubik, 300–700">
          {(
            [
              ['42 / 1.05 / 700', <Num key="a" size={42} weight={700} style={{ lineHeight: 1.05, fontFamily: 'var(--font-heading)' }}>$48,214.60</Num>, 'Portfolio value'],
              ['22 / 1.2 / −.01em', <span key="b" style={{ fontSize: 'var(--fs-2xl)', lineHeight: 1.2, letterSpacing: '-.01em' }}>Watchlist</span>, 'Screen title'],
              ['16 / 600', <span key="c" style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}>Track it yourself</span>, 'Card title, row label'],
              ['14 / 1.5', <span key="d" style={{ fontSize: 'var(--fs-md)', lineHeight: 1.5, color: 'var(--muted)', maxWidth: '46ch', display: 'inline-block', whiteSpace: 'normal' }}>Body copy sits at 14 with a 1.5 leading and the muted grey, so a paragraph never competes with the number above it.</span>, 'Body'],
              ['15 / .08em / 600', <span key="e" style={{ fontSize: 'var(--fs-base)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 'var(--fw-semibold)', color: 'var(--muted)' }}>Good morning</span>, 'Kicker'],
              ['12 / 500', <span key="f" style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)', color: 'var(--muted-2)' }}>NASDAQ · Delayed 15m</span>, 'Meta, tags'],
            ] as const
          ).map(([spec, sample, label], i) => (
            <div key={i} style={{ display: 'flex', gap: 24, alignItems: 'baseline', padding: '16px 0', borderBottom: '1px solid var(--color-divider)' }}>
              <span style={{ width: 150, flex: 'none', fontSize: 'var(--fs-xs)', fontFamily: 'ui-monospace, monospace', color: 'var(--muted-2)' }}>{spec}</span>
              {sample}
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted-2)', marginLeft: 'auto' }}>{label}</span>
            </div>
          ))}
          <Note>
            Every numeral renders through the {'<Num>'} component (direction:ltr; unicode-bidi:isolate) so prices and
            percentages stay readable when the interface flips to RTL.
          </Note>
        </Section>

        {/* 03 — Space, radius, elevation */}
        <Section n="03" title="Space, radius, elevation">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SubTitle>Spacing</SubTitle>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 72, fontSize: 'var(--fs-xs)', fontFamily: 'ui-monospace, monospace', color: 'var(--muted-2)' }}>--space-{n}</span>
                  <span style={{ height: 12, width: `var(--space-${n})`, background: 'var(--color-accent)', borderRadius: 'var(--radius-xs)' }} />
                </div>
              ))}
              <Note>Cards use 12–16 padding with a 10–12 internal gap. Screen gutters are 16 on mobile.</Note>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SubTitle>Radius</SubTitle>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(
                  [
                    ['var(--radius-xs)', 'xs 4'],
                    ['var(--radius-ghost)', 'ghost 6'],
                    ['var(--radius-sm)', 'button · tile 9'],
                    ['var(--radius-md)', 'md 12'],
                    ['var(--radius-lg)', 'card 16'],
                  ] as const
                ).map(([r, label]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}>
                    <span style={{ width: 60, height: 60, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: r }} />
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted-2)', fontFamily: 'ui-monospace, monospace' }}>{label}</span>
                  </div>
                ))}
              </div>
              <SubTitle>Elevation</SubTitle>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div className="card elev-sm" style={{ width: 130, height: 66, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
                  shadow-sm
                </div>
                <div className="card elev-lg" style={{ width: 130, height: 66, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
                  shadow-lg
                </div>
              </div>
              <Note>
                Cards are glass: a translucent fill plus a 12px backdrop blur, with the hairline carried by the shadow's
                first ring rather than a border.
              </Note>
            </div>
          </div>
        </Section>

        {/* 04 — Components (the real ones) */}
        <Section n="04" title="Components" note="rendered from src/components — not copies">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}>
            <Cell title="Buttons">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <Button>Add alert</Button>
                <Button variant="secondary">Compare</Button>
                <Button variant="ghost">Skip</Button>
                <Button disabled>Disabled</Button>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="success">
                  <Icon name="check" size={16} strokeWidth={2.4} />
                  Done
                </Button>
              </div>
              <Note>44px minimum height everywhere on mobile. One primary per screen.</Note>
            </Cell>

            <Cell title="Tags & tiles">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Tag variant="accent">Advisory</Tag>
                <Tag variant="neutral">Neutral</Tag>
                <Tag variant="outline">You're here</Tag>
                <Tag variant="up">+2.4%</Tag>
                <Tag variant="down">−1.1%</Tag>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <TickerTile ticker="NVDA" />
                <TickerTile ticker="TEVA" />
                <TickerTile ticker="ZZZZ" />
              </div>
            </Cell>

            <Cell title="Input & segmented">
              <Field label="Search" placeholder="Search a company or ticker" />
              <SegmentedControl
                options={[
                  { value: 'beg', label: 'Beginner' },
                  { value: 'adv', label: 'Advanced' },
                ]}
                value="beg"
                onChange={() => {}}
              />
              <ProgressTrack pct={62} label="Step 3 of 5" />
            </Cell>

            <Cell title="List row">
              <Card padding="0 15px" gap={0} style={{ overflow: 'hidden' }}>
                <ListRow
                  leading={<TickerTile ticker="NVDA" />}
                  title="NVDA"
                  subtitle="NVIDIA Corp"
                  right={<RowValues main="$118.42" sub="+2.41%" subColor="var(--up)" />}
                  divider={false}
                  padding="13px 0"
                />
                <ListRow
                  leading={<TickerTile ticker="AAPL" />}
                  title="AAPL"
                  subtitle="Apple Inc"
                  right={<RowValues main="$226.05" sub="−0.72%" subColor="var(--down)" />}
                  padding="13px 0"
                />
              </Card>
            </Cell>

            <Cell title="Metric strip">
              <MetricStrip
                metrics={[
                  { label: 'Day', value: '+0.86%', color: 'var(--up)' },
                  { label: 'Month', value: '+4.10%', color: 'var(--up)' },
                  { label: 'Year', value: '−2.35%', color: 'var(--down)' },
                ]}
              />
            </Cell>

            <Cell title="Cards">
              <Card padding={13} gap={4}>
                <CardTitle>Glass card</CardTitle>
                <Note>The default content surface.</Note>
                <Divider />
                <Note>With a Divider between blocks.</Note>
              </Card>
              <Card padding={13} highlight row gap={11}>
                <IconTile size={30} variant="accent" fontSize={15}>
                  ◉
                </IconTile>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>Start here</span>
                  <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--muted-2)', marginTop: 2 }}>Five short lessons · 2 of 5</span>
                </span>
                <span style={{ opacity: 0.5, fontSize: 'var(--fs-base)' }}>›</span>
              </Card>
              <Note>
                The accent border plus the 14%-alpha fill is the only "look at this" treatment in the system. One per
                screen, at most.
              </Note>
            </Cell>

            <Cell title="Chips & icon tiles">
              <ChipRail>
                <Chip active onClick={() => {}}>All</Chip>
                <Chip onClick={() => {}}>My watchlist</Chip>
                <Chip well>Status pill</Chip>
                <Chip active well big>✓ Connected</Chip>
              </ChipRail>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <IconTile size={26} variant="sunk"><Icon name="trend" size={14} /></IconTile>
                <IconTile size={26} variant="accent"><Icon name="list" size={14} /></IconTile>
                <IconTile size={26} variant="tint"><Icon name="bell" size={14} /></IconTile>
                <IconTile size={26} circle variant="solid" fontSize={13}><b>1</b></IconTile>
                <IconTile size={26} circle variant="outline" fontSize={13}>2</IconTile>
              </div>
            </Cell>

            <Cell title="Option card">
              <OptionCardDemo />
            </Cell>

            <Cell title="Chat bubbles">
              <ChatBubble who="bot">How long is this money staying invested?</ChatBubble>
              <ChatBubble who="me">More than five years.</ChatBubble>
            </Cell>

            <Cell title="Allocation & segments">
              <AllocationBar name="US large-cap" pct={45} fund="Vanguard S&P 500 (VOO)" colorVar={ALLOC_COLORS[0]} />
              <AllocationBar name="Bonds" pct={25} fund="iShares IG Corporate (LQD)" colorVar={ALLOC_COLORS[3]} />
              <SegmentBar
                segments={[
                  { value: 31, colorVar: 'var(--up)' },
                  { value: 11, colorVar: 'var(--acc-mid)' },
                  { value: 8, colorVar: 'var(--muted-2)' },
                  { value: 3, colorVar: 'var(--down)' },
                ]}
              />
            </Cell>

            <Cell title="Donut">
              <DonutChart
                slices={[
                  { label: 'NVDA', pct: 40, colorVar: ALLOC_COLORS[0] },
                  { label: 'MSFT', pct: 35, colorVar: ALLOC_COLORS[1] },
                  { label: 'Cash', pct: 25, colorVar: ALLOC_COLORS[2] },
                ]}
              />
            </Cell>

            <Cell title="Charts">
              <AreaChart values={DEMO_SERIES} height={64} />
              <Sparkline values={DEMO_SERIES} color="var(--color-accent)" width={120} height={30} />
              <CandleChart closes={DEMO_SERIES} showMA showRSI={false} showMACD={false} rsiNow={58} />
            </Cell>

            <Cell title="Progress">
              <ProgressDots total={5} current={2} />
              <SegmentDots total={5} current={2} />
              <ProgressTrack pct={62} label="Step 3 of 5" />
            </Cell>

            <Cell title="Toggle">
              <ToggleDemo />
            </Cell>

            <Cell title="Honest data states">
              <DataState state={{ status: 'loading' }}>{() => null}</DataState>
              <DataState state={{ status: 'unavailable' }} onRetry={() => {}}>{() => null}</DataState>
              <EmptyState>No open positions right now</EmptyState>
              <Note>
                Loading, unavailable and empty are real, rendered states — never replaced by placeholder numbers.
              </Note>
            </Cell>

            <Cell title="Sheet">
              <SheetDemo />
            </Cell>
          </div>
        </Section>

        {/* 05 — Rules */}
        <Section n="05" title="Rules">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 26 }}>
            <Rule title="Numbers stay LTR">
              Prices, percentages and tickers isolate their direction. Layout mirrors; the figures don't.
            </Rule>
            <Rule title="Logical properties">
              Use inset-inline-end and text-align:start so Hebrew flips without extra rules.
            </Rule>
            <Rule title="Two view modes">
              Beginner hides ratios and shows plain-language framing. Advanced exposes metric strips. Same components,
              different density.
            </Rule>
            <Rule title="Colour is never the only signal">
              Every up/down colour is paired with a sign, and the signal palette can be dialled down in Settings.
            </Rule>
            <Rule title="No execution, ever">
              Money-touching actions show a confirmation/disclosure or refer out to the user's own broker. Alerts inform;
              they never trade.
            </Rule>
            <Rule title="Honest data">
              Loading, empty and unavailable states are real states. A missing number renders as missing — never as a
              plausible-looking placeholder.
            </Rule>
          </div>
        </Section>
      </div>
    </div>
  );
}

const DEMO_SERIES = [104, 102, 105, 108, 107, 111, 109, 114, 113, 117, 116, 120, 118, 122, 125, 123, 127, 126, 130, 128];

function OptionCardDemo() {
  const [pick, setPick] = useState<'a' | 'b'>('a');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(
        [
          ['a', 'Beginner', 'Plain-language framing, fewer ratios'],
          ['b', 'Advanced', 'Metric strips, dense rows'],
        ] as const
      ).map(([k, name, note]) => (
        <OptionCard key={k} active={pick === k} onClick={() => setPick(k)}>
          <span style={{ display: 'block', fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)' }}>{name}</span>
          <span className="text-muted" style={{ display: 'block', fontSize: 'var(--fs-sm)', marginTop: 2 }}>{note}</span>
        </OptionCard>
      ))}
    </div>
  );
}

function ToggleDemo() {
  const [on, setOn] = useState(true);
  return (
    <ListRow
      title={<span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)' }}>Push notifications</span>}
      subtitle="Price, news and earnings alerts"
      trailing={<Toggle on={on} onChange={setOn} />}
      divider={false}
    />
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', minHeight: 220, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div style={{ padding: 14 }}>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open sheet
        </Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="New alert" meta={<Num>NVDA · $118.42</Num>}>
        <Note>The app's one modal treatment — glass ground, grab handle, veil dismiss.</Note>
        <Button block onClick={() => setOpen(false)}>
          Close
        </Button>
      </Sheet>
    </div>
  );
}

function Section({ n, title, note, children }: { n: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, borderBottom: '1px solid var(--color-divider)', paddingBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-sm)', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', fontWeight: 'var(--fw-semibold)' }}>
          {n} — {title}
        </h2>
        {note && <span style={{ fontSize: 'var(--fs-md)', color: 'var(--muted-2)' }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-semibold)', color: 'var(--muted)' }}>{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--fs-sm)', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', fontWeight: 'var(--fw-semibold)' }}>{children}</div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--muted-2)', maxWidth: '70ch' }}>{children}</p>;
}

function Swatch({ varName, hexNote }: { varName: string; hexNote: string }) {
  return (
    <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
      <div style={{ height: 76, background: `var(${varName})` }} />
      <div style={{ padding: '10px 12px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-card-text)' }}>{varName}</span>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted-2)', fontFamily: 'ui-monospace, monospace' }}>{hexNote}</span>
      </div>
    </div>
  );
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SubTitle>{title}</SubTitle>
      {children}
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}>{title}</span>
      <p style={{ margin: 0, fontSize: 'var(--fs-md)', lineHeight: 1.6, color: 'var(--muted)' }}>{children}</p>
    </div>
  );
}
