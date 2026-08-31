import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import './proto.css';
import { Frame } from './Frame';
import { Picker } from './Picker';
import { Sunken } from './variants/Sunken';
import { Edgeless } from './variants/Edgeless';
import { Slab } from './variants/Slab';
import { Lifted } from './variants/Lifted';

/**
 * Prototype surface — four directions for the app's content card, behind the
 * picker. Isolated by construction: nothing in the app imports from here, and
 * proto-cards.html is deliberately not one of vite.config's build inputs, so
 * this exists on the dev server and nowhere else. Delete src/proto-cards/ and
 * proto-cards.html when a direction wins.
 */
const VARIANTS = [
  { name: 'Sunken', render: () => <Sunken /> },
  { name: 'Edgeless', render: () => <Edgeless /> },
  { name: 'Slab', render: () => <Slab /> },
  { name: 'Lifted', render: () => <Lifted /> },
];

const initialIndex = () => {
  const raw = Number.parseInt(new URLSearchParams(location.search).get('v') ?? '', 10);
  return raw >= 1 && raw <= VARIANTS.length ? raw - 1 : 0;
};

function Prototypes() {
  const [current, setCurrent] = useState(initialIndex);
  // Bumped to re-mount the stage, which is what re-runs a variant's entrance.
  const [nonce, setNonce] = useState(0);

  const select = useCallback((i: number) => {
    setCurrent(i);
    setNonce((n) => n + 1);
    const url = new URL(location.href);
    url.searchParams.set('v', String(i + 1));
    history.replaceState(null, '', url);
  }, []);
  const replay = useCallback(() => setNonce((n) => n + 1), []);

  return (
    <div className="p-page">
      <Frame>
        <React.Fragment key={`${current}-${nonce}`}>{VARIANTS[current].render()}</React.Fragment>
      </Frame>
      <Picker
        names={VARIANTS.map((v) => v.name)}
        current={current}
        onSelect={select}
        onReplay={replay}
        /* The tab bar owns the bottom of the frame, so the picker moves off it. */
        position="top"
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Prototypes />
  </React.StrictMode>,
);
