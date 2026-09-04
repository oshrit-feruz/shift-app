#!/usr/bin/env node --test
/**
 * Tests the funnel arithmetic, which is the half that can be wrong plausibly.
 *
 * A misprinted table gets noticed. A rate computed off the wrong denominator
 * does not — it just reads as a slightly surprising number and gets believed.
 * That defect shipped once already: on #56 `pct_acted` could exceed 100%,
 * because `broker_action_clicked` also fires from the Connections screen, so
 * the numerator counted sessions the denominator never did. The fix was to
 * condition every later stage on `reco_started`, and the test below is what
 * stops that fix being quietly undone.
 *
 *   node --test "scripts/*.test.mjs"
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { rollup, rate } from "./funnel.mjs";

const ev = (session_id, name) => ({
  session_id,
  name,
  created_at: "2026-09-04T00:00:00Z",
});
const stage = (f, name) => f.stages.find((s) => s.name === name);

test("a session is counted once per view stage, however many rows it has", () => {
  // The DB's partial unique index prevents this, but the reader must not
  // depend on the database having held the line.
  const f = rollup([
    ev("s1", "reco_started"),
    ev("s1", "reco_started"),
    ev("s1", "reco_completed"),
  ]);
  assert.equal(f.started, 1);
  assert.equal(stage(f, "reco_started").sessions, 1);
  assert.equal(stage(f, "reco_completed").sessions, 1);
});

test("clicks are counted every time, unlike view stages", () => {
  const f = rollup([
    ev("s1", "reco_started"),
    ev("s1", "broker_action_clicked"),
    ev("s1", "broker_action_clicked"),
  ]);
  // One session reached the stage, and it acted twice: `events` exceeding
  // `sessions` on this row is the intended behaviour, not a double count.
  assert.equal(stage(f, "broker_action_clicked").sessions, 1);
  assert.equal(stage(f, "broker_action_clicked").events, 2);
});

test("THE INVARIANT: no stage can exceed the started count", () => {
  // The #56 defect, reproduced as data: two sessions act on a broker, only one
  // ever started the flow. A naive count would report 2/1 = 200%.
  const f = rollup([
    ev("in", "reco_started"),
    ev("in", "broker_action_clicked"),
    ev("out", "broker_action_clicked"),
  ]);
  assert.equal(f.started, 1);
  assert.equal(
    stage(f, "broker_action_clicked").sessions,
    1,
    "the outside session must not count",
  );
  for (const s of f.stages) {
    assert.ok(
      s.sessions <= f.started,
      `${s.name} (${s.sessions}) exceeded started (${f.started})`,
    );
  }
  assert.equal(
    rate(stage(f, "broker_action_clicked").sessions, f.started),
    "100.0%",
  );
});

test("actions outside the flow are reported, not discarded", () => {
  const f = rollup([
    ev("in", "reco_started"),
    ev("out", "broker_action_clicked"),
    ev("out", "broker_action_clicked"),
    ev("out2", "broker_action_clicked"),
  ]);
  assert.equal(f.outside.sessions, 2);
  assert.equal(f.outside.clicks, 3);
});

test("a stage reached without its predecessor still counts", () => {
  // Stage 4 can legitimately arrive without stage 3 — the read-only connect
  // card lives on screens reachable outside the flow. The rollup must not
  // assume an order it does not enforce.
  const f = rollup([
    ev("s1", "reco_started"),
    ev("s1", "broker_action_clicked"),
  ]);
  assert.equal(stage(f, "broker_screen_viewed").sessions, 0);
  assert.equal(stage(f, "broker_action_clicked").sessions, 1);
});

test("an empty denominator reads as unknown, never as zero", () => {
  assert.equal(rate(0, 0), "—");
  assert.equal(rate(5, 0), "—");
  // A real zero is still a zero: we measured, and nobody converted.
  assert.equal(rate(0, 10), "0.0%");
});

test("no events rolls up to all zeros rather than throwing", () => {
  const f = rollup([]);
  assert.equal(f.events, 0);
  assert.equal(f.sessions, 0);
  assert.equal(f.started, 0);
  assert.equal(f.outside.sessions, 0);
  for (const s of f.stages) assert.equal(s.sessions, 0);
});
