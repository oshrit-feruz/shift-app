import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { ListRow, RowValues } from '../components/ListRow';
import { TickerTile } from '../components/TickerTile';
import { MetricStrip } from '../components/MetricStrip';
import { SegmentedControl } from '../components/SegmentedControl';
import { ProgressTrack } from '../components/Progress';
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
          <img
            src="/assets/shift-wordmark.png"
            alt="Shift"
            style={{ height: 30, width: 'auto', display: 'block' }}
          />
          <Kicker>Design system</Kicker>
          <h1
            style={{
              margin: 0,
              fontSize: 53,
              lineHeight: 1.04,
              letterSpacing: '-.02em',
              fontWeight: 600,
              maxWidth: '16ch',
              whiteSpace: 'normal',
            }}
          >
            The tokens and parts behind Shift
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: '60ch',
              fontSize: 'var(--text-title)',
              lineHeight: 1.6,
              color: 'var(--muted)',
            }}
          >
            Every value here is read live from tokens.css and rendered with the shipping component library —
            the same code the app itself composes from. Dark is the default surface; light mode swaps the ramp
            but keeps cards dark on purpose, so contrast against the page stays high in both.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <a
              href="/"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid var(--color-divider)',
                color: 'var(--acc-pale)',
                fontSize: 'var(--text-row)',
                fontWeight: 500,
              }}
            >
              Mobile app →
            </a>
            <Button
              variant="secondary"
              minHeight={0}
              fontSize={17}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              Toggle theme (now: {theme})
            </Button>
          </div>
        </div>

        {/* 01 — Color */}
        <Section n="01" title="Color" note="tokens.css · dark default, light overrides">
          <SubTitle>Surfaces</SubTitle>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12 }}
          >
            <Swatch varName="--color-bg" hexNote="#0F172A / #F1F5F9" />
            <Swatch varName="--g1" hexNote="gradient top" />
            <Swatch varName="--color-surface" hexNote="glass card fill" />
            <Swatch varName="--sunk" hexNote="sunken fills" />
          </div>
          <SubTitle>Accent ramp — violet (indigo in light)</SubTitle>
          <div
            style={{
              display: 'flex',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--color-divider)',
            }}
          >
            {(
              [
                ['--color-accent-200', '200'],
                ['--color-accent-300', '300'],
                ['--color-accent', 'accent'],
                ['--color-accent-700', '700'],
                ['--color-accent-800', '800'],
              ] as const
            ).map(([v, label]) => (
              <div
                key={v}
                style={{
                  flex: 1,
                  padding: '20px 14px 16px',
                  background: `var(${v})`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 32,
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-caption)',
                    fontWeight: 600,
                    color: label === '200' || label === '300' ? '#1E293B' : '#fff',
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-caption)',
                    fontFamily: 'ui-monospace, monospace',
                    color: label === '200' || label === '300' ? '#4C1D95' : '#DDD6FE',
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
          <Note>
            800 backs icon tiles and pills. 300 carries interactive text. --fill-selected is the accent at 14%
            alpha for selected/active fills; --tile-ground is the same faint violet for a monogram tile's
            ground, next to real logo tiles' white.
          </Note>
          <SubTitle>Signal — up / down</SubTitle>
          <Note>
            Three intensities ship behind the data-signal attribute so the same screens can be read by users
            who find saturated red/green stressful.
          </Note>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 640 }}>
            {(['vivid', 'balanced', 'muted'] as const).map((sig) => (
              <div
                key={sig}
                data-signal={sig === 'vivid' ? undefined : sig}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid var(--color-divider)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                }}
              >
                <Kicker>{sig}</Kicker>
                <Num size={21} weight={600} style={{ color: 'var(--up)' }}>
                  +0.86%
                </Num>
                <Num size={21} weight={600} style={{ color: 'var(--down)' }}>
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
              [
                '42 / 1.05 / 700',
                <Num
                  key="a"
                  size={46}
                  weight={700}
                  style={{ lineHeight: 1.05, fontFamily: 'var(--font-heading)' }}
                >
                  $48,214.60
                </Num>,
                'Portfolio value',
              ],
              [
                '22 / 1.2 / −.01em',
                <span
                  key="b"
                  style={{ fontSize: 'var(--text-heading)', lineHeight: 1.2, letterSpacing: '-.01em' }}
                >
                  Watchlist
                </span>,
                'Screen title',
              ],
              [
                '16 / 600',
                <span key="c" style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>
                  Track it yourself
                </span>,
                'Card title, row label',
              ],
              [
                '14 / 1.5',
                <span
                  key="d"
                  style={{
                    fontSize: 'var(--text-row)',
                    lineHeight: 1.5,
                    color: 'var(--muted)',
                    maxWidth: '46ch',
                    display: 'inline-block',
                    whiteSpace: 'normal',
                  }}
                >
                  Body copy sits at 14 with a 1.5 leading and the muted grey, so a paragraph never competes
                  with the number above it.
                </span>,
                'Body',
              ],
              [
                '15 / .08em / 600',
                <span
                  key="e"
                  style={{
                    fontSize: 'var(--text-title)',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: 'var(--muted)',
                  }}
                >
                  Good morning
                </span>,
                'Kicker',
              ],
              [
                '12 / 500',
                <span
                  key="f"
                  style={{ fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--muted-2)' }}
                >
                  NASDAQ · Delayed 15m
                </span>,
                'Meta, tags',
              ],
            ] as const
          ).map(([spec, sample, label], i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 24,
                alignItems: 'baseline',
                padding: '16px 0',
                borderBottom: '1px solid var(--color-divider)',
              }}
            >
              <span
                style={{
                  width: 150,
                  flex: 'none',
                  fontSize: 'var(--text-caption)',
                  fontFamily: 'ui-monospace, monospace',
                  color: 'var(--muted-2)',
                }}
              >
                {spec}
              </span>
              {sample}
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--muted-2)', marginLeft: 'auto' }}>
                {label}
              </span>
            </div>
          ))}
          <Note>
            Every numeral renders through the {'<Num>'} component (direction:ltr; unicode-bidi:isolate) so
            prices and percentages stay readable when the interface flips to RTL.
          </Note>
        </Section>

        {/* 03 — Space, radius, elevation */}
        <Section n="03" title="Space, radius, elevation">
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SubTitle>Spacing</SubTitle>
              {[4, 6, 8, 10, 12, 16, 22].map((n) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 46,
                      fontSize: 'var(--text-caption)',
                      fontFamily: 'ui-monospace, monospace',
                      color: 'var(--muted-2)',
                    }}
                  >
                    {n}
                  </span>
                  <span
                    style={{ height: 12, width: n, background: 'var(--color-accent)', borderRadius: 2 }}
                  />
                </div>
              ))}
              <Note>Cards use 12–16 padding with a 10–12 internal gap. Screen gutters are 16 on mobile.</Note>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SubTitle>Radius</SubTitle>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(
                  [
                    ['7px', 'icon'],
                    ['var(--radius-sm)', 'button 9'],
                    ['var(--radius-md)', 'md 12'],
                    ['var(--radius-lg)', 'card 16'],
                  ] as const
                ).map(([r, label]) => (
                  <div
                    key={label}
                    style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}
                  >
                    <span
                      style={{
                        width: 60,
                        height: 60,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-divider)',
                        borderRadius: r,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--muted-2)',
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <SubTitle>Elevation</SubTitle>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div
                  className="card elev-sm"
                  style={{
                    width: 130,
                    height: 66,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                  }}
                >
                  shadow-sm
                </div>
                <div
                  className="card elev-lg"
                  style={{
                    width: 130,
                    height: 66,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                  }}
                >
                  shadow-lg
                </div>
              </div>
              <Note>
                Cards are glass: a translucent fill plus a 12px backdrop blur, with the hairline carried by
                the shadow's first ring rather than a border. The specular rim rides inside these same shadow
                tokens, so a surface cannot take the elevation without taking the material.
              </Note>

              <SubTitle>Glass</SubTitle>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div
                  className="card elev-sm"
                  style={{
                    width: 130,
                    height: 66,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                  }}
                >
                  card
                </div>
                <div
                  className="glass-bar elev-lg"
                  style={{
                    width: 130,
                    height: 66,
                    borderRadius: 999,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                  }}
                >
                  bar
                </div>
                <div
                  className="glass-sheet elev-lg"
                  style={{
                    width: 130,
                    height: 66,
                    borderRadius: 20,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                  }}
                >
                  sheet
                </div>
              </div>
              <Note>
                Three depths of one material — card, bar, sheet — differing only in how much they blur and how
                far they lift the colour behind them. It is an approximation of iOS's Liquid Glass, not the
                real material: the web has no API for that one. Tint and specular are here; refraction (the
                background bending at the rim) is not, because it costs an SVG displacement map per pane and
                these panes sit over live charts. Turn on "reduce transparency" and all three go opaque.
              </Note>
            </div>
          </div>
        </Section>

        {/* 04 — Components (the real ones) */}
        <Section n="04" title="Components" note="rendered from src/components — not copies">
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}
          >
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
              <input className="input" placeholder="Search a company or ticker" />
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
              <div className="card elev-sm" style={{ overflow: 'hidden', padding: '0 15px' }}>
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
              </div>
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

            <Cell title="Highlight card">
              <div
                className="card"
                style={{
                  padding: 13,
                  border: '1px solid var(--color-accent)',
                  background: 'var(--fill-selected)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 11,
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    flex: 'none',
                    borderRadius: 9,
                    background: 'var(--color-accent-800)',
                    color: 'var(--color-accent-200)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'var(--text-title)',
                  }}
                >
                  ◉
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--text-body)' }}>Start here</span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--text-caption)',
                      color: 'var(--muted-2)',
                      marginTop: 2,
                    }}
                  >
                    Five short lessons · 2 of 5
                  </span>
                </span>
                <span style={{ opacity: 0.5, fontSize: 'var(--text-title)' }}>›</span>
              </div>
              <Note>
                The accent border plus the 14%-alpha fill is the only "look at this" treatment in the system.
                One per screen, at most.
              </Note>
            </Cell>
          </div>
        </Section>

        {/* 05 — Rules */}
        <Section n="05" title="Rules">
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 26 }}
          >
            <Rule title="Numbers stay LTR">
              Prices, percentages and tickers isolate their direction. Layout mirrors; the figures don't.
            </Rule>
            <Rule title="Logical properties">
              Use inset-inline-end and text-align:start so Hebrew flips without extra rules.
            </Rule>
            <Rule title="Two view modes">
              Beginner hides ratios and shows plain-language framing. Advanced exposes metric strips. Same
              components, different density.
            </Rule>
            <Rule title="Colour is never the only signal">
              Every up/down colour is paired with a sign, and the signal palette can be dialled down in
              Settings.
            </Rule>
            <Rule title="No execution, ever">
              Money-touching actions show a confirmation/disclosure or refer out to the user's own broker.
              Alerts inform; they never trade.
            </Rule>
            <Rule title="One material, three depths">
              The tint and specular values live once in tokens.css; base.css turns them into .card, .glass-bar
              and .glass-sheet. No screen writes its own backdrop-filter, which is what lets one place in
              base.css take the transparency back out everywhere at once.
            </Rule>
            <Rule title="Honest data">
              Loading, empty and unavailable states are real states. A missing number renders as missing —
              never as a plausible-looking placeholder.
            </Rule>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          borderBottom: '1px solid var(--color-divider)',
          paddingBottom: 12,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--text-body)',
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--muted-2)',
            fontWeight: 600,
          }}
        >
          {n} — {title}
        </h2>
        {note && <span style={{ fontSize: 'var(--text-row)', color: 'var(--muted-2)' }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--muted)' }}>{children}</div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 'var(--text-body)',
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        color: 'var(--muted-2)',
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 'var(--text-body)',
        lineHeight: 1.6,
        color: 'var(--muted-2)',
        maxWidth: '70ch',
      }}
    >
      {children}
    </p>
  );
}

function Swatch({ varName, hexNote }: { varName: string; hexNote: string }) {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-divider)' }}>
      <div style={{ height: 76, background: `var(${varName})` }} />
      <div
        style={{
          padding: '10px 12px',
          background: 'var(--color-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: '#fff' }}>{varName}</span>
        <span
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--muted-2)',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {hexNote}
        </span>
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
      <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{title}</span>
      <p style={{ margin: 0, fontSize: 'var(--text-row)', lineHeight: 1.6, color: 'var(--muted)' }}>
        {children}
      </p>
    </div>
  );
}
