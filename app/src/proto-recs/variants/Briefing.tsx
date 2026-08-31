import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Num } from '../../components/Num';
import { TickerTile } from '../../components/TickerTile';
import { useToast } from '../../components/Toast';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { money } from '../../lib/format';
import { HomeScaffold } from '../HomeScaffold';
import { CANDIDATES, SATELLITE_PCT, UNIVERSE, c, type VariantProps } from '../content';

/**
 * BRIEFING — the axis is what the advisory track *is*.
 *
 * The other two treat it as a wizard: four questions with a recommendation at
 * the end, and once you have been through it there is nothing left to come
 * back for. This one treats it as a service that runs every day whether or
 * not you have a profile — the published rule set screens the same universe
 * each morning, and the result of this morning's run is a thing worth putting
 * on the home page on its own.
 *
 * That reframing is what makes the block honest for a user with no profile:
 * the list is not withheld as bait, because it genuinely is the same list for
 * everyone. What the profile decides is how much of a portfolio — if any —
 * belongs in individual stocks, and that is exactly what the card asks for.
 */
export function Briefing({ phase, setPhase }: VariantProps) {
  return <HomeScaffold afterHero={<Block phase={phase} setPhase={setPhase} />} tracks="none" />;
}

function Block({ phase, setPhase }: VariantProps) {
  const t = useT();
  const { language } = useTheme();
  const toast = useToast();
  return (
    <Card padding={13} gap={10}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="text-muted"
            style={{
              fontSize: 'var(--text-micro)',
              letterSpacing: 'var(--track-micro)',
              lineHeight: 'var(--lead-micro)',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {today(language)}
          </div>
          <CardTitle>{c('briefTitle', language)}</CardTitle>
        </div>
        <Tag variant="outline" fontSize={15}>
          {t('adv.tag')}
        </Tag>
      </div>

      {/* The count is the headline, and it carries the denominator with it:
          "3 passed" alone reads as a tip sheet, "3 of 100 passed every check"
          reads as what it is — the output of a published rule. */}
      <p style={{ fontSize: 'var(--text-row)', lineHeight: 1.5, margin: 0 }}>
        <Num size="var(--text-heading)" weight={700} style={{ fontFamily: 'var(--font-heading)' }}>
          {CANDIDATES.length}
        </Num>{' '}
        {c('briefCount', language, { checked: UNIVERSE })}
      </p>

      <div style={{ display: 'flex', gap: 7 }}>
        {CANDIDATES.map((x) => (
          <button
            key={x.ticker}
            type="button"
            className="proto-rise"
            onClick={() => toast(c('outOfScope', language))}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              minHeight: 44,
              padding: '9px 4px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-divider)',
              background: 'var(--sunk)',
              color: 'inherit',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            <TickerTile ticker={x.ticker} size={26} />
            <Num size="var(--text-row)" weight={600}>
              {x.ticker}
            </Num>
            <Num size="var(--text-caption)" style={{ color: 'var(--muted)' }}>
              {money(x.price)}
            </Num>
          </button>
        ))}
      </div>

      {phase === 'new' ? (
        <>
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
            {c('briefSameForAll', language)}
          </p>
          <Button block minHeight={44} onClick={() => setPhase('done')}>
            {t('home.trackAdvisor')}
          </Button>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-caption)' }}>
            {c('briefSleeve', language, { pct: SATELLITE_PCT })}
          </span>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="ghost" fontSize={16} onClick={() => toast(c('outOfScope', language))}>
              {c('briefOpen', language)} ›
            </Button>
          </span>
        </div>
      )}

      {/* The fine print comes after the action, not before it: what the check
          is, then what the list is not. */}
      <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
        {t('rec.updatedDaily')}
      </p>

      {/* The line the product rules require wherever individual stocks appear,
          at the same prominence as the list itself. */}
      <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
        {t('adv.noAction')} · {t('rec.notAnOrder')}
      </p>
    </Card>
  );
}

/** "Sunday · 31 August", in the reader's language — the date the run happened,
 *  which is what makes the card read as today's rather than as a fixture. */
function today(language: 'en' | 'he'): string {
  const d = new Date();
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
  const day = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return `${weekday} · ${day}`;
}
