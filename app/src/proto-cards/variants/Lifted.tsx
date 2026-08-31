import { AllMovers, Help, HeroBody, MoverRows, SectionHead, SetupBody, WatchRows } from '../content';

/**
 * Lifted — the glass, further. More blur and saturation, a brighter rim, an
 * accent bloom across the leading corner, a real drop beneath, and a
 * specular pass that rides the entrance rather than playing on its own.
 */
export function Lifted() {
  return (
    <div className="p-col v-lifted">
      <div className="pane">
        <HeroBody />
      </div>

      <button type="button" className="pane pane--accent">
        <SetupBody />
      </button>

      <div className="pane">
        <SectionHead title="Watchlist" action="See all" />
        <WatchRows />
      </div>

      <div className="pane">
        <SectionHead title="What's moving today" />
        <Help>Big one-day moves usually follow news. Tap one to read why.</Help>
        <MoverRows />
        <AllMovers />
      </div>
    </div>
  );
}
