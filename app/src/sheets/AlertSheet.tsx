import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Num } from '../components/Num';
import { SegmentedControl } from '../components/SegmentedControl';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { moneyOrDash } from '../lib/format';
import { useDispatch, type AlertKind } from '../state/appState';
import type { SymbolInfo } from '../data/types';

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
  const [kind, setKind] = useState<AlertKind>('price');
  const [cond, setCond] = useState<'rise' | 'fall'>('rise');
  const [remind, setRemind] = useState<'day' | 'morning' | 'lands'>('day');
  const [value, setValue] = useState('200.00');
  const [keywords, setKeywords] = useState(t('alert.keywords'));
  const [sources, setSources] = useState({ wires: true, filings: true });
  const [notifyBy, setNotifyBy] = useState({ push: true, email: false });
  const beg = mode === 'beginner';

  const types: Array<{ k: AlertKind; glyph: string; title: string; help: string }> = [
    { k: 'price', glyph: '▲', title: t('alert.priceType'), help: t('alert.priceHelp') },
    { k: 'news', glyph: '◎', title: t('alert.newsType'), help: t('alert.newsHelp') },
    { k: 'earn', glyph: '📅', title: t('alert.earnType'), help: t('alert.earnHelp') },
  ];

  const submit = () => {
    dispatch({
      type: 'addAlert',
      alert: {
        id: `alert-${Date.now()}`,
        ticker: symbol?.ticker ?? '',
        kind,
        condition: cond,
        value: kind === 'price' ? value : kind === 'news' ? keywords : '',
        remind,
        sources,
        notifyBy,
      },
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('watch.newAlert')}
      meta={symbol ? <Num>{`${symbol.ticker} · ${moneyOrDash(symbol.quote?.price)}`}</Num> : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {types.map((a) => (
          <button
            key={a.k}
            type="button"
            onClick={() => setKind(a.k)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              minHeight: 52,
              padding: '9px 11px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
              textAlign: 'start',
              border: `1px solid ${kind === a.k ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              background:
                kind === a.k ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                flex: 'none',
                borderRadius: 8,
                background: 'var(--color-accent-900)',
                color: 'var(--color-accent-300)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 16,
              }}
            >
              {a.glyph}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 16.5 }}>{a.title}</span>
              <span className="text-muted" style={{ display: 'block', fontSize: 15.5 }}>
                {a.help}
              </span>
            </span>
            <span style={{ color: 'var(--color-accent)', fontSize: 17 }}>{kind === a.k ? '✓' : ''}</span>
          </button>
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
              fontSize={16}
            />
          </div>
          <Field label={t('alert.price')} value={value} onChange={(e) => setValue(e.target.value)} />
          {beg && (
            <p className="text-muted" style={{ fontSize: 15.5, margin: 0 }}>
              {t('alert.priceHint')}
            </p>
          )}
        </>
      )}
      {kind === 'news' && (
        <>
          <Field label={t('alert.mentions')} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          <div className="field">
            <label>{t('alert.sources')}</label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={sources.wires}
                  onChange={(e) => setSources({ ...sources, wires: e.target.checked })}
                />{' '}
                {t('alert.wires')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={sources.filings}
                  onChange={(e) => setSources({ ...sources, filings: e.target.checked })}
                />{' '}
                {t('alert.filings')}
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
            fontSize={15.5}
          />
        </div>
      )}

      <div className="field">
        <label>{t('alert.notifyBy')}</label>
        <div style={{ display: 'flex', gap: 14, fontSize: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={notifyBy.push}
              onChange={(e) => setNotifyBy({ ...notifyBy, push: e.target.checked })}
            />{' '}
            {t('alert.push')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={notifyBy.email}
              onChange={(e) => setNotifyBy({ ...notifyBy, email: e.target.checked })}
            />{' '}
            {t('alert.email')}
          </label>
        </div>
      </div>
      <Button block minHeight={44} onClick={submit}>
        {t('alert.create')}
      </Button>
    </Sheet>
  );
}
