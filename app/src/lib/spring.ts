/**
 * Apple's two-parameter spring, driven by requestAnimationFrame.
 *
 * Apple deliberately dropped the physics triplet (mass/stiffness/damping) for
 * two numbers a designer can reason about, and this takes the same pair:
 *
 *   damping  — ζ. 1 is critically damped: it settles onto the target without
 *              ever passing it. Below 1 it overshoots and oscillates, and the
 *              lower it goes the bouncier it reads. Reserve anything under 1
 *              for motion the user's own gesture put in flight; overshoot on
 *              something that merely appeared looks like a bug.
 *   response — roughly how long, in seconds, the value takes to arrive. It is
 *              NOT a duration: a spring has none, and its settle time falls
 *              out of the two parameters together.
 *
 * A spring rather than a keyframe because a spring is interruptible by
 * construction. Re-targeting one is just starting a new spring from the value
 * and velocity the old one was carrying, so a gesture can grab a moving thing
 * and reverse it with no seam. A CSS animation can only be cancelled and
 * restarted, which is the visible jolt this file exists to avoid.
 *
 * Solved analytically rather than integrated step-by-step, so a long frame
 * changes nothing about where the value lands — it just samples the same
 * curve later.
 */

/** Below these, the motion is finished as far as a display is concerned. */
const REST_DISTANCE_PX = 0.4;
const REST_VELOCITY_PX_S = 8;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type SpringHandle = {
  /** Cancel the animation where it stands; `value`/`velocity` stay readable. */
  stop: () => void;
  /** The presentation value — what is on screen right now, not the target.
   *  Every interruption has to start from this, or it starts with a jump. */
  value: () => number;
  /** Carried through a re-target so a reversal blends instead of hard-cutting
   *  to zero, which reads as hitting a wall. */
  velocity: () => number;
};

export function spring(opts: {
  from: number;
  to: number;
  /** Release velocity in px/s, signed the same way as the value. Handing the
   *  gesture's own velocity in is what removes the seam between dragging and
   *  animating. */
  velocity?: number;
  damping?: number;
  response?: number;
  onFrame: (value: number) => void;
  onRest?: () => void;
}): SpringHandle {
  const { from, to, velocity: v0 = 0, damping = 1, response = 0.4, onFrame, onRest } = opts;

  let value = from;
  let vel = v0;
  let frame = 0;
  let done = false;

  const finish = () => {
    done = true;
    value = to;
    vel = 0;
    onFrame(to);
    onRest?.();
  };

  // Reduced motion asks for the outcome without the journey. Jumping also
  // keeps this hook consistent with base.css, which collapses every CSS
  // duration to .01ms rather than removing the animation.
  if (prefersReducedMotion() || response <= 0) {
    finish();
    return { stop: () => {}, value: () => value, velocity: () => 0 };
  }

  const omega = (2 * Math.PI) / response;
  // Overdamped springs need a different closed form and no UI here wants one,
  // so ζ is clamped into the range these two branches cover.
  const zeta = Math.min(Math.max(damping, 0), 1);
  const x0 = from - to; // displacement, which is what actually decays
  const start = performance.now();

  const step = (now: number) => {
    const t = (now - start) / 1000;
    let x: number;
    let v: number;

    if (zeta < 1) {
      const wd = omega * Math.sqrt(1 - zeta * zeta); // damped frequency
      const decay = Math.exp(-zeta * omega * t);
      const c = (v0 + zeta * omega * x0) / wd;
      const sin = Math.sin(wd * t);
      const cos = Math.cos(wd * t);
      x = decay * (x0 * cos + c * sin);
      v = decay * ((c * wd - x0 * zeta * omega) * cos - (x0 * wd + c * zeta * omega) * sin);
    } else {
      const decay = Math.exp(-omega * t);
      const c = v0 + omega * x0;
      x = (x0 + c * t) * decay;
      v = (v0 - omega * c * t) * decay;
    }

    value = to + x;
    vel = v;

    if (Math.abs(x) < REST_DISTANCE_PX && Math.abs(v) < REST_VELOCITY_PX_S) {
      finish();
      return;
    }
    onFrame(value);
    frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);

  return {
    stop: () => {
      if (!done) cancelAnimationFrame(frame);
    },
    value: () => value,
    velocity: () => vel,
  };
}

/**
 * Where a flick would coast to a stop, from the sample code in Apple's
 * "Designing Fluid Interfaces". Snapping to the nearest edge measured from
 * the *release point* ignores the throw entirely; snapping to the edge
 * nearest this projection is what makes a flick feel like it threw something.
 *
 * Note this is exponential decay, not the textbook v²/(2a). The difference
 * is shape rather than scale: this is linear in velocity, where the textbook
 * form is quadratic and so grows out of all proportion on a hard flick.
 */
export function projectMomentum(velocityPxS: number, decelerationRate = 0.998): number {
  return ((velocityPxS / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Progressive resistance past a boundary. A hard stop reads as frozen; a
 * surface that keeps moving but gives less and less back reads as responsive
 * with nothing more behind it.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
