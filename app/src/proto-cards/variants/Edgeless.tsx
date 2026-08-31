import { AllMovers, Help, HeroBody, MoverRows, SectionHead, SetupBody, WatchRows } from '../content';

/**
 * Edgeless — no surface at all. An eyebrow label, a hairline and air do the
 * work the pane used to do. The ground shows through unbroken, the content
 * spans the full width, and nothing on the screen blurs.
 */
export function Edgeless() {
  return (
    <div className="p-col v-edgeless">
      <section className="sect">
        <span className="sect-label">Portfolio</span>
        <HeroBody />
      </section>

      <section className="sect sect--accent">
        <span className="sect-label">Setup</span>
        <SetupBody />
      </section>

      <section className="sect">
        <span className="sect-label">Watchlist</span>
        <SectionHead title="Tracking 3 stocks" action="See all" />
        <span className="sect-rule" />
        <WatchRows ruled />
      </section>

      <section className="sect">
        <span className="sect-label">Movers</span>
        <SectionHead title="What's moving today" />
        <Help>Big one-day moves usually follow news. Tap one to read why.</Help>
        <span className="sect-rule" />
        <MoverRows ruled />
        <AllMovers />
      </section>
    </div>
  );
}
