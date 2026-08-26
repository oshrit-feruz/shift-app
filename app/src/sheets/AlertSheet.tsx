import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { OptionCard } from '../components/OptionCard';
import { IconTile } from '../components/IconTile';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Num } from '../components/Num';
import { SegmentedControl } from '../components/SegmentedControl';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useDispatch } from '../state/appState';
import { money } from '../lib/format';
import type { SymbolInfo } from '../data/types';

type Kind = 'price' | 'news' | 'earn';

/** New-alert sheet. Alerts are notifications only — creating one never
 *  places or schedules any trade. */
export function AlertSheet({
  open,
  onClose,
  symbol,
}: {
  open: boolean;
  onClose: () => void;
  symbol: SymbolInfo | null;
}) {
  const { mode } = useTheme();
  const t = useT();
  const dispatch = useDispatch();
  const [kind, setKind] = useState<Kind>('price');
  const [cond, setCond] = useState<'rise' | 'fall'>('rise');
  const [remind, setRemind] = useState<'day' | 'morning' | 'lands'>('day');
  const [level, setLevel] = useState('200.00');
  const [keywords, setKeywords] = useState('');
  const beg = mode === 'beginner';

  const types: Array<{ k: Kind; glyph: string; title: string; help: string }> = [
    { k: 'price', glyph: '▲', title: t('alert.priceType'), help: t('alert.priceHelp') },
    { k: 'news', glyph: '◎', title: t('alert.newsType'), help: t('alert.newsHelp') },
    { k: 'earn', glyph: '📅', title: t('alert.earnType'), help: t('alert.earnHelp') },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('watch.newAlert')}
      meta={symbol ? <Num>{`${symbol.ticker} · ${money(symbol.price)}`}</Num> : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {types.map((a) => (
          <OptionCard key={a.k} active={kind === a.k} onClick={() => setKind(a.k)} padding="9px 11px" minHeight={52}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconTile size={28} variant="tint" fontSize={13}>
                {a.glyph}
              </IconTile>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>{a.title}</span>
                <span className="text-muted" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                  {a.help}
                </span>
              </span>
              <span style={{ color: 'var(--color-accent)', fontSize: 'var(--fs-md)' }}>{kind === a.k ? '✓' : ''}</span>
            </span>
          </OptionCard>
        ))}
      </div>

      {kind === 'price' && (
        <>
          <div className="field">
            <label>{t('alert.condition')}</label>
            <SegmentedControl
              options={[
                { value: 'rise', label: t('alert.rises') },
                { value: 'fall', label: t('alert.falls') },
              ]}
              value={cond}
              onChange={setCond}
              fontSize={13}
            />
          </div>
          <Field label={t('alert.price')} value={level} onChange={(e) => setLevel(e.target.value)} />
          {beg && (
            <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
              {t('alert.priceHint')}
            </p>
          )}
        </>
      )}
      {kind === 'news' && (
        <>
          <Field label={t('alert.mentions')} value={keywords} placeholder={t('alert.keywords')} onChange={(e) => setKeywords(e.target.value)} />
          <div className="field">
            <label>{t('alert.sources')}</label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" defaultChecked /> {t('alert.wires')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" defaultChecked /> {t('alert.filings')}
              </label>
            </div>
          </div>
        </>
      )}
      {kind === 'earn' && (
        <div className="field">
          <label>{t('alert.remindMe')}</label>
          <SegmentedControl
            options={[
              { value: 'day', label: t('alert.dayBefore') },
              { value: 'morning', label: t('alert.morningOf') },
              { value: 'lands', label: t('alert.whenLands') },
            ]}
            value={remind}
            onChange={setRemind}
            fontSize={12.5}
          />
        </div>
      )}

      <div className="field">
        <label>{t('alert.notifyBy')}</label>
        <div style={{ display: 'flex', gap: 14, fontSize: 'var(--fs-sm)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" defaultChecked /> {t('alert.push')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" /> {t('alert.email')}
          </label>
        </div>
      </div>
      <Button
        block
        minHeight={44}
        disabled={kind === 'price' && !(parseFloat(level.replace(/[^0-9.]/g, '')) > 0)}
        onClick={() => {
          dispatch({
            type: 'createAlert',
            alert: {
              kind,
              ticker: symbol?.ticker ?? 'NVDA',
              direction: kind === 'price' ? cond : undefined,
              level: kind === 'price' ? parseFloat(level.replace(/[^0-9.]/g, '')) || undefined : undefined,
              keywords: kind === 'news' && keywords ? keywords : undefined,
              created: new Date().toISOString().slice(0, 10),
            },
          });
          onClose();
        }}
      >
        {t('alert.create')}
      </Button>
    </Sheet>
  );
}
