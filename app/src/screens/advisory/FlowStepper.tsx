import { ADV_ORDER, useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';

/** Prev/next stepper + progress dots shown atop advisory-flow screens (hidden
 *  when a step was opened standalone). */
export function FlowStepper() {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  if (s.advSolo || !ADV_ORDER.includes(s.screen)) return null;
  const i = ADV_ORDER.indexOf(s.screen);
  const canPrev = i > 0;
  const canNext = i >= 0 && i < Math.min(s.advStage, 4);

  const btn = (on: boolean): React.CSSProperties => ({
    whiteSpace: 'nowrap',
    flex: 'none',
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--color-divider)',
    background: 'var(--sunk)',
    font: 'inherit',
    fontSize: 12.5,
    cursor: on ? 'pointer' : 'default',
    color: 'inherit',
    opacity: on ? 1 : 0.3,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0 10px' }}>
      <button type="button" style={btn(canPrev)} onClick={() => canPrev && dispatch({ type: 'advGoto', screen: ADV_ORDER[i - 1] })}>
        ‹ {t('adv.stepPrev')}
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
        {ADV_ORDER.map((k, j) => (
          <span
            key={k}
            style={{
              width: j === i ? 18 : 6,
              height: 6,
              borderRadius: 4,
              background: j === i ? 'var(--color-accent)' : j <= s.advStage ? 'var(--acc-dim)' : 'var(--line)',
            }}
          />
        ))}
      </div>
      <button type="button" style={btn(canNext)} onClick={() => canNext && dispatch({ type: 'advGoto', screen: ADV_ORDER[i + 1] })}>
        {t('adv.stepNext')} ›
      </button>
    </div>
  );
}
