import { useCallback, useState, type ComponentType } from 'react';
import { Picker } from './Picker';
import { Shell } from './Shell';
import { Beacon } from './variants/Beacon';
import { Inline } from './variants/Inline';
import { Briefing } from './variants/Briefing';
import type { Phase, VariantProps } from './content';

/**
 * The prototype stage: one variant at a time, full size, inside the real app
 * shell, with the picker floating below the phone rather than over it.
 *
 * Nothing in the app imports anything from this directory — proto.html is the
 * only entry point that reaches it, and it is deliberately not one of the
 * build's inputs (vite.config.ts), so this surface exists in `npm run dev`
 * and nowhere else.
 */
const VARIANTS: Array<{ name: string; View: ComponentType<VariantProps> }> = [
  { name: 'Beacon', View: Beacon },
  { name: 'Inline', View: Inline },
  { name: 'Briefing', View: Briefing },
];

/** Selection survives a reload, per the picker contract. */
function initialIndex(): number {
  const raw = Number.parseInt(new URLSearchParams(location.search).get('v') ?? '', 10);
  return raw >= 1 && raw <= VARIANTS.length ? raw - 1 : 0;
}

export function Harness() {
  const [current, setCurrent] = useState(initialIndex);
  // Bumped to re-mount the stage without changing variant — what the replay
  // key does. Switching variants re-mounts anyway (the key carries the index),
  // so entrance animations run on every switch.
  const [nonce, setNonce] = useState(0);
  const [phase, setPhase] = useState<Phase>('new');

  const select = useCallback((i: number) => {
    setCurrent(i);
    const url = new URL(location.href);
    url.searchParams.set('v', String(i + 1));
    history.replaceState(null, '', url);
  }, []);
  const replay = useCallback(() => setNonce((n) => n + 1), []);

  const { View } = VARIANTS[current];

  return (
    <div className="proto-desk">
      <div className="proto-bar">
        <span className="proto-bar-label">state</span>
        <button
          type="button"
          className="proto-bar-btn"
          onClick={() => setPhase('new')}
          {...(phase === 'new' ? { 'data-active': '' } : {})}
        >
          no recommendation yet
        </button>
        <button
          type="button"
          className="proto-bar-btn"
          onClick={() => setPhase('done')}
          {...(phase === 'done' ? { 'data-active': '' } : {})}
        >
          has a recommendation
        </button>
      </div>

      {/* Keyed, so a switch or a replay re-mounts the whole page: the card
          stagger and the block's own entrance both run again, which is what
          makes flipping between variants a comparison of how they arrive and
          not only of how they sit. */}
      <Shell key={`${current}-${nonce}`}>
        <View phase={phase} setPhase={setPhase} />
      </Shell>

      <Picker names={VARIANTS.map((v) => v.name)} current={current} onSelect={select} onReplay={replay} />
    </div>
  );
}
