import { AllMovers, Help, HeroBody, MoverRows, SectionHead, SetupBody, WatchRows } from '../content';

/**
 * Sunken — the depth story inverted. Content is a well cut into the ground,
 * not a pane resting on it: no drop shadow, a darker fill than the ground,
 * and the only light is the rim along the bottom lip of the cut.
 */
export function Sunken() {
  return (
    <div className="p-col v-sunken">
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
