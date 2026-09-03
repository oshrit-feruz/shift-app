import { useEffect, useId, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Num } from '../components/Num';
import { SegmentedControl } from '../components/SegmentedControl';
import { useT } from '../i18n/useT';
import { moneyOrDash } from '../lib/format';
import { newId } from '../lib/ids';
import { useToast } from '../components/Toast';
import { alertKey, useAppState, useDispatch, type AlertKind, type SavedAlert } from '../state/appState';
import { fetchQuotes } from '../data/quotes';
import { useLoadable } from '../data/useLoadable';
import { ok, type Quote } from '../data/types';

/**
 * New-alert sheet. Alerts are notifications only — creating one never places
 * or schedules any trade.
 *
 * `ticker` is what the alert will be about. Opened from somewhere with no
 * ticker in hand — the watchlist's own "New alert" button — the sheet asks
 * which stock, choosing from the user's watchlist, rather than saving an
 * alert attached to nothing.
 *
 * The sheet reads the stock's live quote itself (the same /api/quote every
 * screen prints), for three things: the price in the header, the level the
 * field opens at, and the "about N% above today's price" line under it. It
 * used to open at a literal 200.00 whatever the stock, which for a $30 stock
 * was a rule nobody meant.
 */
export function AlertSheet({
  open,
  onClose,
  ticker,
}: {
  open: boolean;
  onClose: () => void;
  ticker: string;
}) {
  const t = useT();
  const dispatch = useDispatch();
  const toast = useToast();
  const s = useAppState();
  const pickerId = useId();
  const [picked, setPicked] = useState('');
  // Cleared on close, not only on submit: the sheet stays mounted between
  // openings, so a stock picked and then cancelled would still be selected —
  // and the Create button still enabled — the next time it opens, ready to
  // file an alert against a stock nobody chose this time.
  useEffect(() => {
    if (!open) setPicked('');
  }, [open]);
  // The caller's ticker wins; the picker only matters when it gave none.
  const target = ticker || picked;
  const [kind, setKind] = useState<AlertKind>('price');
  const [cond, setCond] = useState<'rise' | 'fall'>('rise');
  const [remind, setRemind] = useState<'day' | 'morning' | 'lands'>('day');
  // The quote for the stock the alert is about. Only read while the sheet
  // is open and has a target: a closed sheet must not spend a call, and one
  // with nothing picked yet has nothing to ask for.
  const quote = useLoadable<Record<string, Quote>>(
    () => (open && target ? fetchQuotes([target]) : Promise.resolve(ok({}))),
    [open, target],
  );
  const price = quote.state.status === 'ok' ? (quote.state.data[target]?.price ?? null) : null;
  // The level field opens at the live price and follows it until the user
  // types — after that it is theirs, and a refreshed quote must not overwrite
  // what they entered.
  const [value, setValue] = useState('');
  const [edited, setEdited] = useState(false);
  // Reset on every open AND on every change of stock. Closing alone is not
  // enough: the sheet can be handed a different ticker while it is open, and
  // a level typed for the previous one would otherwise still be in the field,
  // ready to be saved as a rule about a stock it was never meant for.
  useEffect(() => {
    setValue('');
    setEdited(false);
  }, [open, target]);
  useEffect(() => {
    if (open && !edited) setValue(defaultLevel(price));
  }, [open, edited, price]);
  const [keywords, setKeywords] = useState(t('alert.keywords'));
  // Kept on the saved rule for compatibility with rules already stored; the
  // engine reads every article the provider returns for the stock, so there
  // is no source filter to offer.
  const sources = { wires: true, filings: true };
  // Email is not delivered by anything yet, so it cannot be chosen: a box
  // that could be ticked would promise a channel that does not exist.
  const [notifyBy, setNotifyBy] = useState({ push: true, email: false });
  const hint = priceHint(value, price);
  // A price rule needs a level the engine can read; the others need none.
  const levelOk = kind !== 'price' || readableLevel(value);

  const types: Array<{ k: AlertKind; glyph: string; title: string; help: string }> = [
    { k: 'price', glyph: '▲', title: t('alert.priceType'), help: t('alert.priceHelp') },
    { k: 'news', glyph: '◎', title: t('alert.newsType'), help: t('alert.newsHelp') },
    { k: 'earn', glyph: '📅', title: t('alert.earnType'), help: t('alert.earnHelp') },
  ];

  // Everything about the alert except its id, which is minted once, on save —
  // a fresh one per render would be thrown away on every keystroke.
  const draft: Omit<SavedAlert, 'id'> = {
    ticker: target,
    kind,
    condition: cond,
    value: kind === 'price' ? value : kind === 'news' ? keywords : '',
    remind,
    sources,
    notifyBy,
  };
  // Saving the same alert twice is a mistake, not an intent — so the state
  // collapses it — but silently closing the sheet on a duplicate would look
  // like nothing happened at all, and the user would try again. Say which of
  // the two it was.
  const duplicate = target !== '' && s.savedAlerts.some((x) => alertKey(x) === alertKey(draft));

  const submit = () => {
    if (!target || !levelOk) return;
    dispatch({ type: 'addAlert', alert: { ...draft, id: newId('alert') } });
    toast(duplicate ? t('alert.already', { ticker: target }) : t('alert.created', { ticker: target }));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('watch.newAlert')}
      meta={
        target ? (
          // The dash only once the read has settled: while it is in flight
          // the price is not missing, it is not here yet.
          <Num>{quote.state.status === 'loading' ? target : `${target} · ${moneyOrDash(price)}`}</Num>
        ) : undefined
      }
    >
      {/* Only when the caller had no ticker. Everywhere else the alert's
          subject is already decided and re-asking would be noise. */}
      {!ticker &&
        (s.watchlist.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.45 }}>
            {t('alert.noStock')}
          </p>
        ) : (
          <div className="field">
            <label htmlFor={pickerId}>{t('alert.stock')}</label>
            <select
              id={pickerId}
              className="input"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              style={{ height: 40, minHeight: 40 }}
            >
              <option value="">{t('alert.pickStock')}</option>
              {s.watchlist.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {types.map((a) => (
          <button
            key={a.k}
            type="button"
            className="select-card"
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
                kind === a.k ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'var(--sunk)',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                flex: 'none',
                borderRadius: 8,
                background: 'var(--fill-selected)',
                color: 'var(--color-accent-300)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 'var(--text-body)',
              }}
            >
              {a.glyph}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-body)' }}>{a.title}</span>
              <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
                {a.help}
              </span>
            </span>
            <span style={{ color: 'var(--color-accent)', fontSize: 'var(--text-row)' }}>
              {kind === a.k ? '✓' : ''}
            </span>
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
          <Field
            label={t('alert.price')}
            value={value}
            placeholder={price === null ? '0.00' : undefined}
            onChange={(e) => {
              setEdited(true);
              setValue(e.target.value);
            }}
          />
          {hint && (
            <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
              {t(hint.above ? 'alert.hintAbove' : 'alert.hintBelow', { pct: hint.pct })}
            </p>
          )}
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.45 }}>
            {t('alert.priceNote')}
          </p>
        </>
      )}
      {kind === 'news' && (
        <>
          <Field label={t('alert.mentions')} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.45 }}>
            {t('alert.newsNote')}
          </p>
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
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.45 }}>
            {t('alert.earnNote')}
          </p>
        </div>
      )}

      <div className="field">
        <label>{t('alert.notifyBy')}</label>
        <div style={{ display: 'flex', gap: 14, fontSize: 'var(--text-body)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={notifyBy.push}
              onChange={(e) => setNotifyBy({ ...notifyBy, push: e.target.checked })}
            />{' '}
            {t('alert.push')}
          </label>
          <label className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={false} disabled readOnly /> {t('alert.emailSoon')}
          </label>
        </div>
      </div>
      {duplicate && (
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.45 }}>
          {t('alert.duplicateHint')}
        </p>
      )}
      <Button block minHeight={44} onClick={submit} disabled={!target || !levelOk}>
        {duplicate ? t('alert.update') : t('alert.create')}
      </Button>
    </Sheet>
  );
}

/**
 * How far the typed level sits from today's price, for the line under the
 * field — or null when either number is missing, in which case the sheet
 * shows no figure rather than a made-up one (the line used to be a literal
 * "9.6%" whatever was typed and whatever the price).
 */
export function priceHint(level: string, price: number | null): { above: boolean; pct: string } | null {
  if (price === null || price <= 0) return null;
  const n = parseLevel(level);
  if (!Number.isFinite(n) || n <= 0) return null;
  const pct = ((n - price) / price) * 100;
  return { above: pct >= 0, pct: Math.abs(pct).toFixed(1) };
}

/** What the level field opens at: the live price to the cent, or empty when there is none. */
export function defaultLevel(price: number | null): string {
  return price !== null && price > 0 ? price.toFixed(2) : '';
}

/** Whether the typed level is a price the engine will read (see api/_lib/alerts.ts readLevel). */
export function readableLevel(level: string): boolean {
  const n = parseLevel(level);
  return Number.isFinite(n) && n > 0;
}

/** The typed level as a number: a leading dollar sign and thousands separators are allowed. */
function parseLevel(level: string): number {
  return Number(level.trim().replace(/^\$/, '').replaceAll(',', ''));
}
