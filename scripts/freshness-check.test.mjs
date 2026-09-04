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
import { findCoverageMarker } from "./freshness-check.mjs";

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
