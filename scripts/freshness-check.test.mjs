#!/usr/bin/env node --test
/**
 * Tests the one part of freshness-check that can be wrong quietly.
 *
 * The network reads either work or throw, and a throw exits 2 with the reason
 * printed. The marker parser is different: given a body it cannot read, the
 * honest failure is "no marker found" and the DANGEROUS failure is returning a
 * stale marker that happens to parse — which would report a head as reviewed
 * when it is not. That is the exact class of bug this whole script exists to
 * catch, so it gets tests of its own.
 *
 * The fixtures below are real bodies from the GitHub API, not invented ones.
 * The escaping matters: GitHub returns the marker's JSON entity-escaped
 * (`&#123;` for `{`, `&quot;` for `"`), so a parser written against the form
 * shown in the rendered walkthrough silently finds nothing.
 *
 *   node --test "scripts/*.test.mjs"
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findCoverageMarker,
  verdict,
  safeText,
  staleBy,
  checkCodeRabbit,
} from "./freshness-check.mjs";

const HEAD = "3a13ad899af61548f66ffb6ad07f66e92171a125";
const REVIEWED = "87efa7c98112d8900a8516f4ae4c754e8f166145";

/** As GitHub actually returns it: entity-escaped inside an HTML comment. */
const escapedBody =
  `**Merge Risk:** _🟡 Moderate_ · up to \`87efa\`\n` +
  `<!-- final_review_risk_coverage:&#123;&quot;sourceCommitId&quot;:&quot;${REVIEWED}&quot;,` +
  `&quot;coveredCommitId&quot;:&quot;${REVIEWED}&quot;,&quot;kind&quot;:&quot;reviewed&quot;&#125; -->\n`;

/** The same marker unescaped, which some surfaces return instead. */
const plainBody =
  `<!-- final_review_risk_coverage:{"sourceCommitId":"${HEAD}",` +
  `"coveredCommitId":"${HEAD}","kind":"reviewed"} -->`;

test("parses the entity-escaped marker GitHub actually returns", () => {
  const m = findCoverageMarker([{ body: escapedBody }]);
  assert.equal(m?.coveredCommitId, REVIEWED);
});

test("parses an unescaped marker too", () => {
  const m = findCoverageMarker([{ body: plainBody }]);
  assert.equal(m?.coveredCommitId, HEAD);
});

test("takes the newest marker when a PR carries several walkthrough edits", () => {
  // Comments arrive oldest-first from the API. The latest edit is the only one
  // describing the current state; reading the first would report a commit that
  // was current several pushes ago.
  const m = findCoverageMarker([{ body: escapedBody }, { body: plainBody }]);
  assert.equal(m?.coveredCommitId, HEAD);
});

test("reports nothing rather than guessing when no marker is present", () => {
  assert.equal(findCoverageMarker([{ body: "LGTM" }, { body: "" }]), null);
  assert.equal(findCoverageMarker([]), null);
});

test("a malformed marker does not hide an older valid one", () => {
  // A truncated payload must not end the search: falling back to the previous
  // valid marker is wrong too, but reporting null when a real one exists would
  // fire a false alarm, and this parser's job is to be believed.
  const broken = `<!-- final_review_risk_coverage:&#123;&quot;coveredCommitId&quot; -->`;
  const m = findCoverageMarker([{ body: escapedBody }, { body: broken }]);
  assert.equal(m?.coveredCommitId, REVIEWED);
});

test("ignores a comment that merely mentions the marker name in prose", () => {
  const prose = {
    body: "the final_review_risk_coverage: marker is stuck on 87efa",
  };
  assert.equal(findCoverageMarker([prose]), null);
});

// --- exit codes -----------------------------------------------------------
//
// These four cases are the whole contract, and the third one is why the
// function exists: this workflow's own first CI run exited 2 on a healthy PR,
// because "no requested check was applicable yet" went down the same path as
// "you configured nothing". A checker that is red by default is one nobody
// reads — the exact failure it was written to prevent.

test("exit 2 when nothing was even requested — a misconfiguration", () => {
  const v = verdict({ failures: 0, ran: 0, requested: 0 });
  assert.equal(v.code, 2);
  assert.match(v.message, /nothing was checked/);
});

test("exit 1 when something measured is stale", () => {
  const v = verdict({ failures: 2, ran: 2, requested: 1 });
  assert.equal(v.code, 1);
  assert.match(v.message, /would be lying/);
});

test("exit 0 when a requested check is not applicable yet — the CI regression", () => {
  // No SONAR_TOKEN, and a PR head inside the review grace period: one check
  // requested, none evaluated, nothing wrong. This returned 2 before.
  const v = verdict({ failures: 0, ran: 0, requested: 1 });
  assert.equal(v.code, 0);
  assert.match(v.message, /none applicable yet/);
});

test("exit 0 when everything measured is current", () => {
  const v = verdict({ failures: 0, ran: 3, requested: 2 });
  assert.equal(v.code, 0);
  assert.match(v.message, /All 3 signal\(s\) current/);
});

// --- sanitising remote text ------------------------------------------------
//
// Every string this script prints about a signal came back from SonarCloud or
// GitHub, and some of it is written by people. A checker whose output can be
// spoofed by the service it is checking is worth nothing — and SonarCloud's
// jssecurity:S5145 failed this PR's own gate on exactly that.

test("strips newlines that could forge a log line", () => {
  // The shape that matters: a remote string ending the current line and
  // opening a convincing fake one.
  const attack = "ok\n  ok    sonar: main baseline is current";
  const out = safeText(attack);
  assert.ok(!out.includes("\n"), "newline survived into log output");
  assert.ok(!out.includes("\r"));
  // The newline becomes a space, joining the two that already followed it.
  assert.match(out, /ok {3}ok {4}sonar/);
});

test("strips ANSI escapes and other control characters", () => {
  const out = safeText("red\u001b[31mALERT\u001b[0m\u0007bell");
  assert.ok(!/[\u0000-\u001F\u007F-\u009F]/.test(out), "control char survived");
  assert.match(out, /ALERT/);
});

test("caps length, with a per-call override for diagnostics worth keeping", () => {
  const long = "x".repeat(1000);
  assert.equal(safeText(long).length, 200);
  assert.equal(safeText(long, 300).length, 300);
});

test("handles null and undefined rather than printing them unguarded", () => {
  assert.equal(safeText(undefined), "");
  assert.equal(safeText(null), "");
});

// --- is a scheduled job still firing --------------------------------------
//
// A cron job that stops produces no failure, no red check and no notification.
// It simply stops, and everything downstream keeps serving what it last
// published — the stale Sonar baseline of #58, pointed at CI.
//
// The tolerance is deliberately generous. Every measured run of this repo's
// screener mirror started 4h05m-6h53m after its nominal slot, so an alarm tuned
// to lateness would fire constantly and be muted. This asks "has it stopped".

const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-04T12:00:00Z");

test("a run inside the tolerance is not stale", () => {
  const r = staleBy(new Date(NOW - 5 * HOUR).toISOString(), 30, NOW);
  assert.equal(r.stale, false);
  assert.ok(Math.abs(r.ageHours - 5) < 0.001);
});

test("a run past the tolerance is stale", () => {
  const r = staleBy(new Date(NOW - 31 * HOUR).toISOString(), 30, NOW);
  assert.equal(r.stale, true);
});

test("lateness alone does not trip it — that is the muting failure", () => {
  // The worst delay actually measured on this repo: 6h53m. With a daily job on
  // a 30h tolerance that must still read as healthy, or the alarm cries wolf
  // every single day and stops being read.
  const r = staleBy(new Date(NOW - 6.9 * HOUR).toISOString(), 30, NOW);
  assert.equal(r.stale, false);
});

test("an unparseable timestamp is stale, not silently fine", () => {
  // The dangerous direction: NaN comparisons are false, so a naive
  // `age > max` would call a garbage timestamp healthy.
  const r = staleBy("not a date", 30, NOW);
  assert.equal(r.stale, true);
  assert.match(r.reason, /unparseable/);
});

test("exactly at the tolerance is not yet stale", () => {
  assert.equal(
    staleBy(new Date(NOW - 30 * HOUR).toISOString(), 30, NOW).stale,
    false,
  );
});

// --- the review check addresses the PR it was given -----------------------
//
// This exists because of a real bug that shipped into review: checkCodeRabbit
// took `prNumber` but built the comments URL from the module-level `PR`. Under
// `--pr <n>` those are equal, so every PR run passed. Under `--all-prs` the
// global is null, the URL becomes /issues/null/comments, GitHub answers 404 and
// the run exits 2 — meaning the SCHEDULED SWEEP, the only mode that can catch a
// stale review, would have failed on every execution while the PR runs that
// masked it stayed green.
//
// So the assertion is not "it works" but "it uses its argument": every GitHub
// URL this function requests must carry the PR number it was handed.

test("builds every request from its prNumber argument, not a global", async () => {
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const body = String(url).includes("/status")
      ? { statuses: [] }
      : String(url).includes("/comments")
        ? []
        : String(url).includes("/commits/")
          ? { commit: { committer: { date: "2020-01-01T00:00:00Z" } } }
          : { head: { sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  try {
    await checkCodeRabbit(4242);
  } finally {
    globalThis.fetch = realFetch;
  }

  const prScoped = asked.filter(
    (u) => u.includes("/pulls/") || u.includes("/issues/"),
  );
  assert.ok(
    prScoped.length >= 2,
    `expected PR-scoped requests, got ${asked.join(", ")}`,
  );
  for (const u of prScoped) {
    // As a path SEGMENT: /pulls/4242 has no trailing slash, /issues/4242/... does.
    assert.match(
      u,
      /\/4242(\/|\?|$)/,
      `request did not carry the given PR number: ${u}`,
    );
    assert.doesNotMatch(
      u,
      /\/(null|undefined)(\/|\?|$)/,
      `bad PR number: ${u}`,
    );
  }
});
