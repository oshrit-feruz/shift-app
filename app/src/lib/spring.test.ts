import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectMomentum, rubberband, spring } from './spring';

/**
 * The springs run on requestAnimationFrame, which Node has no notion of, so
 * these drive the clock by hand: frames are queued rather than scheduled and
 * replayed at whatever timestamps a test wants. `performance.now` is left
 * alone and the real reading is taken just before each spring is built, so
 * the timestamps handed back stay on the same timeline the spring started on.
 */
let pending: FrameRequestCallback[] = [];

beforeEach(() => {
  pending = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => pending.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = [];
  });
});
afterEach(() => vi.unstubAllGlobals());

/** Plays frames at `stepMs` until the spring rests or the budget runs out. */
function play(t0: number, stepMs = 16, budgetMs = 5000): void {
  let elapsed = 0;
  while (pending.length > 0 && elapsed < budgetMs) {
    const frame = pending.shift() as FrameRequestCallback;
    elapsed += stepMs;
    frame(t0 + elapsed);
  }
}

/** Every value a spring painted, in order. */
function record(
  opts: Parameters<typeof spring>[0] extends never
    ? never
    : Omit<Parameters<typeof spring>[0], 'onFrame' | 'onRest'>,
) {
  const values: number[] = [];
  let rests = 0;
  const t0 = performance.now();
  const handle = spring({ ...opts, onFrame: (v) => values.push(v), onRest: () => rests++ });
  play(t0);
  return { values, rests, handle };
}

describe('spring', () => {
  it('lands exactly on the target and reports rest once', () => {
    const { values, rests } = record({ from: 400, to: 0, damping: 1, response: 0.3 });
    expect(values.length).toBeGreaterThan(5);
    // Not "close to zero": a sheet left a fraction of a pixel off its open
    // position is a seam against the screen edge that stays on screen.
    expect(values[values.length - 1]).toBe(0);
    expect(rests).toBe(1);
  });

  it('never passes the target when critically damped', () => {
    // Damping 1 is the default for anything the user did not throw, and the
    // whole reason to pick it is that it cannot overshoot.
    const { values } = record({ from: 400, to: 0, damping: 1, response: 0.3 });
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
  });

  it('overshoots at the drawer damping the sheet actually ships', () => {
    // 0.8 is Apple's published drawer value, and the bounce is the point of
    // it — if this stops overshooting the sheet has quietly gone inert.
    const { values } = record({ from: 400, to: 0, damping: 0.8, response: 0.3 });
    expect(Math.min(...values)).toBeLessThan(-1);
  });

  it('carries release velocity through the start of the motion', () => {
    // Thrown away from the target, it has to travel further out before
    // turning around. This is the seam between a drag and its animation.
    const away = record({ from: 100, to: 0, velocity: 1200, damping: 1, response: 0.3 });
    const still = record({ from: 100, to: 0, velocity: 0, damping: 1, response: 0.3 });
    expect(Math.max(...away.values)).toBeGreaterThan(100);
    expect(Math.max(...still.values)).toBeLessThanOrEqual(100);
  });

  it('exposes the presentation value and velocity mid-flight, for interruption', () => {
    const t0 = performance.now();
    const handle = spring({ from: 400, to: 0, damping: 1, response: 0.3, onFrame: () => {} });
    (pending.shift() as FrameRequestCallback)(t0 + 48);
    handle.stop();
    // An interruption reads these to start the next spring from where this
    // one actually is. Reading the target instead is the visible jump.
    expect(handle.value()).toBeLessThan(400);
    expect(handle.value()).toBeGreaterThan(0);
    expect(handle.velocity()).toBeLessThan(0);
  });

  it('stops scheduling once stopped', () => {
    const t0 = performance.now();
    const values: number[] = [];
    const handle = spring({ from: 400, to: 0, response: 0.3, onFrame: (v) => values.push(v) });
    (pending.shift() as FrameRequestCallback)(t0 + 16);
    handle.stop();
    play(t0);
    expect(values.length).toBe(1);
  });

  it('jumps to the target when there is no response to animate over', () => {
    // The same path reduced motion takes, which cannot be reached from Node.
    const { values, rests } = record({ from: 400, to: 0, response: 0 });
    expect(values).toEqual([0]);
    expect(rests).toBe(1);
  });
});

describe('projectMomentum', () => {
  it('projects a flick the distance the deceleration curve gives it', () => {
    // 1000px/s at the default rate: (1 * 0.998) / 0.002.
    expect(projectMomentum(1000)).toBeCloseTo(499, 0);
  });

  it('keeps the sign, so a flick up never projects downward', () => {
    expect(projectMomentum(-800)).toBeLessThan(0);
    expect(projectMomentum(0)).toBe(0);
  });

  it('scales linearly with velocity, unlike the textbook form', () => {
    // Exponential decay is linear in v; the physics-class v^2/(2a) is
    // quadratic, so it grows out of all proportion on a hard flick. This is
    // the difference that matters, not which one is longer at some given
    // deceleration -- that only depends on the constant you pick.
    expect(projectMomentum(2000)).toBeCloseTo(projectMomentum(1000) * 2, 6);
    expect(projectMomentum(4000)).toBeCloseTo(projectMomentum(1000) * 4, 6);
  });
});

describe('rubberband', () => {
  it('always gives back less than was pulled', () => {
    for (const overshoot of [1, 10, 50, 200, 800]) {
      expect(rubberband(overshoot, 400)).toBeLessThan(overshoot);
    }
  });

  it('resists harder the further past the edge it goes', () => {
    // Not a hard stop and not a free slide: each additional pixel of pull
    // returns less movement than the one before it.
    const first = rubberband(50, 400) - rubberband(40, 400);
    const later = rubberband(300, 400) - rubberband(290, 400);
    expect(later).toBeLessThan(first);
    expect(later).toBeGreaterThan(0);
  });

  it('stays continuous through zero, so the edge has no step in it', () => {
    expect(rubberband(0, 400)).toBe(0);
    expect(rubberband(0.5, 400)).toBeGreaterThan(0);
    expect(rubberband(0.5, 400)).toBeLessThan(0.5);
  });
});
