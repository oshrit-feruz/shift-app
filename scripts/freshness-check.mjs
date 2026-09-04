#!/usr/bin/env node
/**
 * Asks one question about the tools that grade this repo: is the number they
 * are reporting still about the thing they claim to be measuring?
 *
 * WHY THIS EXISTS.
 * Twice in one week a green signal turned out to mean nothing had run.
 *
 *   - SonarCloud's `main` analysis had been REJECTED since 29 August (the
 *     organisation is on a 50,000-line cap and the project measures 51,379).
 *     Pull-request scans kept succeeding, so every PR carried a "Quality Gate
 *     passed" comment while the baseline it was compared against was six days
 *     and 176 commits out of date. Nothing went red, because nothing in CI
 *     runs Sonar — it is SonarCloud's own automatic analysis. See issue #58.
 *
 *   - CodeRabbit posted a green commit status on a head it had never
 *     reviewed. The status DESCRIPTION read "Review rate limited"; only the
 *     colour said success. Its walkthrough carried a coverage marker naming
 *     an older commit, and a follow-up comment ("Reviews are available now")
 *     read like good news while still meaning no review had happened.
 *
 * Both are the same failure: not a crash, a measurement that quietly stopped
 * meaning what it appears to mean while continuing to read healthy. A crash
 * gets noticed. This does not — which is why it needs an alarm of its own
 * rather than a habit of remembering to look.
 *
 * This script is the alarm. It reads the TEXT of each signal, never the
 * colour, and fails loudly when a signal points at anything other than the
 * current head.
 *
 * USAGE
 *
 *   # Sonar baseline only. GITHUB_TOKEN is still wanted: main's head date
 *   # comes from the GitHub API, which rate-limits unauthenticated callers.
 *   SONAR_TOKEN=<token> GITHUB_TOKEN=<token> node scripts/freshness-check.mjs
 *
 *   # Both checks, for one pull request
 *   SONAR_TOKEN=<token> GITHUB_TOKEN=<token> \
 *     node scripts/freshness-check.mjs --pr 57
 *
 * Options:
 *   --pr <n>            also check CodeRabbit's review coverage on that PR
 *   --all-prs           check review coverage on every open PR. This is the
 *                       mode that actually catches anything: a push-triggered
 *                       run always sees a head inside the grace period.
 *   --max-age-days <n>  Sonar baseline staleness tolerance (default 2)
 *   --grace-minutes <n> how long a fresh head is exempt from the review
 *                       check (default 20) — a push-triggered run sees a head
 *                       seconds old that no reviewer could have covered yet
 *   --repo owner/name   default oshrit-feruz/shift-app
 *   --project <key>     default oshrit-feruz_shift-app
 *
 * Exit codes: 0 every signal is current · 1 at least one is stale ·
 * 2 the check itself could not run (missing token, network, bad response).
 * 2 is deliberately distinct from 1: "I could not measure" and "I measured
 * and it is stale" are different statements, and collapsing them would
 * reintroduce exactly the ambiguity this script exists to remove.
 */

import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);

/** Reads `--flag value`, returning `fallback` when the flag is absent. */
function arg(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1];
}

const REPO = arg("repo", "oshrit-feruz/shift-app");
const PROJECT = arg("project", "oshrit-feruz_shift-app");
const PR = arg("pr");
const ALL_PRS = args.includes("--all-prs");
const MAX_AGE_DAYS = Number(arg("max-age-days", "2"));
// How long a new head is given before "no review covers it" counts as stale.
const GRACE_MIN = Number(arg("grace-minutes", "20"));

const SONAR_TOKEN = process.env.SONAR_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

let failures = 0;
let ran = 0;
// Checks this invocation ASKED for, which is not the same as assertions that
// evaluated. A requested check can be legitimately not-yet-applicable — see
// the grace period in checkCodeRabbit — and that is a pass, not a
// misconfiguration. Conflating the two made this script's own first CI run
// exit 2 on a healthy PR.
let requested = 0;

/** One assertion. Records a failure without stopping — a run that halts on the
 *  first problem hides the others, and these two signals fail independently. */
function check(name, passed, detail = "") {
  ran += 1;
  const suffix = detail ? ` — ${detail}` : "";
  if (passed) {
    console.log(`  ok    ${name}${suffix}`);
  } else {
    failures += 1;
    console.log(`  STALE ${name}${suffix}`);
  }
}

/** GET returning parsed JSON, or throwing with enough context to act on.
 *
 *  Every non-2xx is fatal rather than falsy. An auth wall that answers 401 and
 *  a project with genuinely nothing to report both produce an empty-looking
 *  result, and treating the first as the second is how a broken check starts
 *  passing. */
async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `${res.status} from ${url.split("?")[0]} — ${body.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `non-JSON from ${url.split("?")[0]} — ${body.slice(0, 200)}`,
    );
  }
}

const days = (ms) => ms / 86_400_000;
const short = (sha) => (sha ? sha.slice(0, 7) : "(none)");

/**
 * When did `main` last actually change?
 *
 * Asked of the GitHub API rather than by shelling out to `git`. Spawning a
 * bare command name resolves it through $PATH, so a writable directory
 * anywhere on that path turns this check into an execution vector — and a
 * script whose whole job is to be trusted about the state of the repo is a
 * poor place to accept that (SonarCloud javascript:S4036, which failed this
 * PR's own quality gate on B Security Rating).
 *
 * This TRADES one requirement for another, and both are worth stating. It
 * removes the need for a checkout with `main` fetched and full history (the
 * workflow was doing `fetch-depth: 0` plus an explicit fetch). It adds a need
 * for GitHub API access: in CI `github.token` covers it, but a local
 * Sonar-only run now needs GITHUB_TOKEN exported, or it hits the
 * unauthenticated rate limit and exits 2.
 *
 * A failure here THROWS rather than falling back to comparing against the
 * clock. "Time since the last analysis" is a different, weaker measurement,
 * and silently substituting it is precisely the substitution this script
 * exists to detect.
 */
async function mainHeadIso() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "shift-freshness-check",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const c = await getJson(
    `https://api.github.com/repos/${REPO}/commits/main`,
    headers,
  );
  const iso = c.commit?.committer?.date || c.commit?.author?.date;
  if (!iso) throw new Error(`GitHub reported no commit date for ${REPO}@main`);
  return iso;
}

/**
 * Is SonarCloud's `main` baseline current, and if not, why?
 *
 * Two independent reads, because they fail differently. The analysis DATE
 * catches a silent stall that produces no failed task at all; the failed-task
 * list names the reason when there is one. Reporting only the date would say
 * "stale" without saying why, which is the half-answer that sent the last
 * investigation down two wrong hypotheses.
 */
async function checkSonar() {
  const headers = { Authorization: `Bearer ${SONAR_TOKEN}` };

  const branches = await getJson(
    `https://sonarcloud.io/api/project_branches/list?project=${encodeURIComponent(PROJECT)}`,
    headers,
  );
  const main = (branches.branches || []).find((b) => b.isMain);
  if (!main) throw new Error(`no main branch reported for ${PROJECT}`);
  if (!main.analysisDate) throw new Error(`main has never been analysed`);

  // The repo's own head is the thing the baseline is supposed to describe.
  const analysed = new Date(main.analysisDate);
  const head = new Date(await mainHeadIso());
  const gap = days(head - analysed);

  check(
    "sonar: main baseline is current",
    gap <= MAX_AGE_DAYS,
    `analysed ${analysed.toISOString()} · main head ${head.toISOString()} · ` +
      `${gap.toFixed(1)}d behind (tolerance ${MAX_AGE_DAYS}d)`,
  );

  // The reason, when there is one. A failed task is worth surfacing even if
  // the date happens to be inside tolerance — it is the leading indicator.
  const activity = await getJson(
    `https://sonarcloud.io/api/ce/activity?component=${encodeURIComponent(PROJECT)}` +
      `&status=FAILED&ps=5`,
    headers,
  );
  const failed = (activity.tasks || []).filter(
    (t) => !t.branch && !t.pullRequest,
  );
  check(
    "sonar: no failed main-branch analyses",
    failed.length === 0,
    failed.length
      ? `${failed.length} recent failure(s); latest ${failed[0].submittedAt}: ` +
          `${(failed[0].errorMessage || "").split("\n")[0]}`
      : "",
  );
}

/**
 * Every open pull request, for the scheduled sweep.
 *
 * WHY THE SWEEP EXISTS. On a `pull_request` event the head is by definition
 * seconds old, so the review check always lands inside its grace period and
 * always skips. Wired only to that trigger, the coverage check could never
 * once fire — it would sit green forever having evaluated nothing, which is
 * the exact failure this script was written to detect, reproduced by the
 * script itself. Caught by reading its own first green run's log rather than
 * its colour.
 *
 * The scheduled run is therefore the one that does the work: by then a head
 * has had hours to be reviewed, and a PR still uncovered is genuinely stale.
 */
async function openPullRequests() {
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "shift-freshness-check",
  };
  const prs = await getJson(
    `https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100`,
    headers,
  );
  return prs.map((p) => p.number);
}

/**
 * Did a CodeRabbit review actually run on this PR's current head?
 *
 * Two reads again, and again because they fail differently:
 *
 *   - The commit STATUS carries the answer in its description, not its state.
 *     "Review rate limited" and "Review skipped: draft pull request" are both
 *     `success`. Reading `state` alone is how a skipped review passes for a
 *     clean one.
 *   - The walkthrough's coverage marker names the commit actually reviewed.
 *     When a push lands after a review, the status may not be re-posted at
 *     all, and this marker is the only thing that still tells the truth.
 */
async function checkCodeRabbit(prNumber) {
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "shift-freshness-check",
  };
  const api = `https://api.github.com/repos/${REPO}`;

  const pr = await getJson(`${api}/pulls/${prNumber}`, headers);
  const headSha = pr.head?.sha;
  if (!headSha) throw new Error(`PR #${prNumber} reported no head sha`);

  // A review takes time. On a push-triggered run the head is seconds old and
  // no reviewer has had a chance yet, so flagging it would fire on every push
  // — and an alarm that cries wolf on every push gets muted, which recreates
  // the failure this exists to catch. Below the grace period the answer is
  // "not yet applicable", which is neither a pass nor a failure.
  const headCommit = await getJson(`${api}/commits/${headSha}`, headers);
  const committed = new Date(
    headCommit.commit?.committer?.date || headCommit.commit?.author?.date,
  );
  const ageMin = (Date.now() - committed.getTime()) / 60_000;
  if (Number.isFinite(ageMin) && ageMin < GRACE_MIN) {
    console.log(
      `  skip  head ${short(headSha)} is ${ageMin.toFixed(0)}m old ` +
        `(grace ${GRACE_MIN}m) — too new to expect a review yet`,
    );
    return;
  }

  // 1. The status description, read as text.
  const status = await getJson(`${api}/commits/${headSha}/status`, headers);
  const cr = (status.statuses || []).find((s) =>
    /coderabbit/i.test(s.context || ""),
  );
  if (!cr) {
    check(
      `coderabbit: a review status exists on ${short(headSha)}`,
      false,
      "no CodeRabbit status on this head",
    );
  } else {
    const desc = cr.description || "";
    // The vocabulary of "this did not happen", all of which ship as `success`.
    const didNotRun =
      /rate limit|skipped|draft|queued|in progress|limit reached/i.test(desc);
    check(
      `coderabbit: status on ${short(headSha)} describes a completed review`,
      !didNotRun,
      `state=${cr.state} description="${desc}"`,
    );
  }

  // 2. The coverage marker, which names the commit that was actually reviewed.
  const comments = await getJson(
    `${api}/issues/${PR}/comments?per_page=100`,
    headers,
  );
  const marker = findCoverageMarker(comments);
  if (!marker) {
    check(
      `coderabbit: walkthrough names a reviewed commit`,
      false,
      "no final_review_risk_coverage marker found in any comment",
    );
    return;
  }
  check(
    `coderabbit: reviewed commit matches head ${short(headSha)}`,
    marker.coveredCommitId === headSha,
    marker.coveredCommitId === headSha
      ? `covered ${short(marker.coveredCommitId)}`
      : `covered ${short(marker.coveredCommitId)}, head is ${short(headSha)} — ` +
          `the head is ahead of the review`,
  );
}

/**
 * Pulls `coveredCommitId` out of CodeRabbit's walkthrough comment.
 *
 * The marker is an HTML comment whose JSON payload GitHub returns
 * entity-escaped (`&#123;` for `{`, `&quot;` for `"`), so a bare JSON.parse on
 * the raw slice fails. Unescaping first, and tolerating the unescaped form
 * too, keeps this working whichever way the body comes back.
 */
export function findCoverageMarker(comments) {
  const KEY = "final_review_risk_coverage:";
  // Newest first: a PR accumulates several walkthrough edits and only the
  // latest describes the current state.
  for (const c of [...comments].reverse()) {
    const body = c.body || "";
    const at = body.indexOf(KEY);
    if (at === -1) continue;
    const rest = body.slice(at + KEY.length);
    const end = rest.indexOf("-->");
    const raw = (end === -1 ? rest : rest.slice(0, end))
      .replaceAll("&#123;", "{")
      .replaceAll("&#125;", "}")
      .replaceAll("&quot;", '"')
      .trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.coveredCommitId) return parsed;
    } catch {
      /* a malformed marker is not a reason to stop looking at older ones */
    }
  }
  return null;
}

/**
 * Turns the tallies into an exit code, kept pure so every branch is testable.
 *
 * This exists because the interesting case is not "stale" or "current" but the
 * third one: a check that was requested and turned out not to apply yet. The
 * first CI run of this very workflow hit it — no SONAR_TOKEN configured, and a
 * PR head one minute old, inside the review grace period — and exited 2,
 * putting a red X on a healthy PR. An alarm that is red by default is one
 * nobody reads, which is the failure this script exists to prevent.
 *
 *   2  nothing was even requested — a misconfiguration, not a measurement
 *   1  something was measured and is stale
 *   0  everything measured is current, OR every requested check was
 *      legitimately not applicable yet
 */
export function verdict({ failures, ran, requested }) {
  if (requested === 0) {
    return {
      code: 2,
      message:
        "nothing was checked — set SONAR_TOKEN and/or pass --pr <n> / --all-prs",
    };
  }
  if (failures > 0) {
    return {
      code: 1,
      message: `${failures} of ${ran} signal(s) stale — a green check here would be lying.`,
    };
  }
  if (ran === 0) {
    return {
      code: 0,
      message: `${requested} check(s) requested, none applicable yet — nothing is stale.`,
    };
  }
  return { code: 0, message: `All ${ran} signal(s) current.` };
}

async function main() {
  console.log(`freshness-check · repo ${REPO} · sonar project ${PROJECT}\n`);

  if (SONAR_TOKEN) {
    requested += 1;
    console.log("SonarCloud baseline:");
    await checkSonar();
  } else {
    console.log("SonarCloud baseline: skipped (no SONAR_TOKEN)");
  }

  if (PR || ALL_PRS) {
    if (!GITHUB_TOKEN) {
      throw new Error("--pr and --all-prs need GITHUB_TOKEN");
    }
    const numbers = PR ? [PR] : await openPullRequests();
    if (numbers.length === 0) {
      console.log("\nCodeRabbit review coverage: no open pull requests");
    }
    for (const n of numbers) {
      requested += 1;
      console.log(`\nCodeRabbit review coverage on PR #${n}:`);
      await checkCodeRabbit(n);
    }
  } else {
    console.log("\nCodeRabbit review coverage: skipped (no --pr/--all-prs)");
  }

  // The requested === 0 case is NOT thrown here: `verdict` owns the exit code
  // so that every branch of it is reachable from a test. Throwing would also
  // route a misconfiguration through the same path as a network failure, and
  // those deserve different messages.
}

// Only when run as a command. Importing the module (freshness-check.test.mjs
// does, to exercise the marker parser against real GitHub bodies) must not
// fire a network run or call process.exit.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
    const v = verdict({ failures, ran, requested });
    console.log(`\n${v.message}`);
    process.exit(v.code);
  } catch (err) {
    console.error(`\nfreshness-check could not run: ${err.message}`);
    process.exit(2);
  }
}
