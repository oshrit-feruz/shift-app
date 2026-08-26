import { ADV_ORDER, useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { Chip } from '../../components/Chip';
import { ProgressDots } from '../../components/Progress';

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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0 10px' }}>
      <span style={{ opacity: canPrev ? 1 : 0.3 }}>
        <Chip onClick={() => canPrev && dispatch({ type: 'advGoto', screen: ADV_ORDER[i - 1] })}>
          ‹ {t('adv.stepPrev')}
        </Chip>
      </span>
      <div style={{ flex: 1 }}>
        <ProgressDots total={ADV_ORDER.length} current={i} done={s.advStage} />
      </div>
      <span style={{ opacity: canNext ? 1 : 0.3 }}>
        <Chip onClick={() => canNext && dispatch({ type: 'advGoto', screen: ADV_ORDER[i + 1] })}>
          {t('adv.stepNext')} ›
        </Chip>
      </span>
    </div>
  );
}
