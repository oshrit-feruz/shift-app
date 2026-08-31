import { AllMovers, Help, HeroBody, MoverRows, SectionHead, SetupBody, WatchRows } from '../content';

/**
 * Slab — opaque. The pane stops sampling the ground entirely: a solid
 * surface with a lit top edge and a tight contact shadow. With no
 * backdrop-filter left on the screen, the pane is free to move and scale on
 * press without detaching anything's blur.
 */
export function Slab() {
  return (
    <div className="p-col v-slab">
      <div className="pane">
        <HeroBody />
      </div>

      <button type="button" className="pane pane--accent">
        <SetupBody />
      </button>

      <div className="pane">
        <SectionHead title="Watchlist" action="See all" />
        <WatchRows ruled />
      </div>

      <div className="pane">
        <SectionHead title="What's moving today" />
        <Help>Big one-day moves usually follow news. Tap one to read why.</Help>
        <MoverRows ruled />
        <AllMovers />
      </div>
    </div>
  );
}
