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
 * THE SHAPES THIS TAKES, all observed on this repo, all worth recognising by
 * name because each one reads as good news:
 *
 *   1. A GREEN CHECK WHOSE TEXT SAYS OTHERWISE. "Review rate limited" and
 *      "Review skipped: draft pull request" both ship as `success`. Only the
 *      description distinguishes them from a review that ran.
 *   2. A COVERAGE MARKER PINNED TO AN OLDER COMMIT. After a later push the
 *      status may not be re-posted at all, and the walkthrough's
 *      `final_review_risk_coverage` is then the only thing still telling the
 *      truth about which commit was actually read.
 *   3. A HEADLINE RENDERED FROM THAT STALE MARKER. "Merge Risk: Moderate ·
 *      up to `87efa`" is the human-readable face of case 2, and it is the one
 *      a person actually reads. It stayed on `87efa` for eight hours across
 *      four pushes while reading like a current verdict.
 *   4. AVAILABILITY REPORTED AS ACTION. "Reviews are available now" says a
 *      quota refilled, not that anything ran — and nothing did, for fifty
 *      minutes, because this reviewer is event-driven and no push or command
 *      had followed. An allowance becoming available is not a queued job
 *      resuming. The two are easy to read as one sentence.
 *   5. SKIPPED IS NOT PASSED. A verification step that is skipped because an
 *      earlier step failed has confirmed NOTHING, while sitting in a list of
 *      steps that mostly say success. On 2026-09-02 the screener mirror's
 *      "Confirm what is now published" was skipped for exactly this reason
 *      (see .github/workflows/mirror-screener.yml) — a positive-confirmation
 *      step that did not run, on a run that had published nothing new.
 *
 * AND ONE TRAP FOR WHOEVER EXTENDS THIS. Do not measure whether a scheduled
 * job is alive by reading its COMMIT LOG. A job that commits only when its
 * data changed produces a log that looks exactly like a run log and counts
 * something else: on this repo it showed one entry per weekday while four
 * passes were configured, and none at all on a Saturday and Sunday when there
 * was correctly nothing to publish. `checkWorkflowSchedules` below reads the
 * Actions API, which reports every attempt whether or not it committed.
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
 *   --workflow f:hours  also check that a scheduled workflow is still firing,
 *                       e.g. --workflow mirror-screener.yml:30. Repeatable.
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
/** Repeatable `--workflow <file>:<maxAgeHours>`, e.g. mirror-screener.yml:30. */
const WORKFLOWS = args
  .map((a, i) => (a === "--workflow" ? args[i + 1] : null))
  .filter(Boolean);
/**
 * A numeric option, or a clear failure.
 *
 * `Number("abc")` is NaN, and every comparison against NaN is false — so an
 * unvalidated option does not error, it silently inverts the check. A bad
 * --max-age-days would report the Sonar baseline stale on every run; a bad
 * --grace-minutes would disable the grace period without saying so. Same trap
 * `staleBy` guards for timestamps.
 */
function positiveNumber(name, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `--${name} must be a non-negative number, got "${safeText(raw, 40)}"`,
    );
  }
  return n;
}

// Validated at module scope but NOT thrown here. A throw during module
// initialisation escapes the run-as-command try/catch entirely: the process
// dies with a stack trace and exit 1, instead of the "could not run" message
// and exit 2 that every other unrunnable state produces — and importing the
// module for tests would blow up on whatever argv happened to be present.
// Deferred to main(), so a bad option reads like every other could-not-measure.
let optionError = null;
let MAX_AGE_DAYS = 2;
let GRACE_MIN = 20;
try {
  MAX_AGE_DAYS = positiveNumber("max-age-days", arg("max-age-days", "2"));
  // How long a new head is given before "no review covers it" counts as stale.
  GRACE_MIN = positiveNumber("grace-minutes", arg("grace-minutes", "20"));
} catch (err) {
  optionError = err;
}

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
      `${res.status} from ${url.split("?")[0]} — ${safeText(body)}`,
    );
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`non-JSON from ${url.split("?")[0]} — ${safeText(body)}`);
  }
}

/**
 * Remote text, made safe to print.
 *
 * Everything this script reports on comes back from SonarCloud or GitHub, and
 * some of it is written by people: a commit-status description, a Sonar error
 * message, an HTTP body echoed into a thrown Error. Printed raw into a CI log
 * it can carry newlines, carriage returns and ANSI escapes — enough to forge a
 * log line, and enough for SonarCloud's jssecurity:S5145 to fail this PR's own
 * quality gate on B Security Rating.
 *
 * A checker whose output can be spoofed by the service it is checking is worth
 * exactly nothing, so this is not gate-appeasement: control characters become
 * spaces and the text is capped, everywhere remote data reaches the console.
 */
export function safeText(value, max = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .trim()
    .slice(0, max);
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
          `${safeText((failed[0].errorMessage || "").split("\n")[0], 300)}`
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
 * How far past its tolerance a timestamp is. Pure, so every branch is testable
 * without a network — the arithmetic is the part that can be quietly wrong.
 */
export function staleBy(lastIso, maxAgeHours, nowMs = Date.now()) {
  const t = Date.parse(lastIso);
  if (Number.isNaN(t))
    return { ageHours: null, stale: true, reason: "unparseable timestamp" };
  const ageHours = (nowMs - t) / 3_600_000;
  return { ageHours, stale: ageHours > maxAgeHours, reason: "" };
}

/**
 * Is a scheduled workflow still actually running?
 *
 * THE CASE THIS EXISTS FOR. A cron job that stops firing produces no failure,
 * no red check and no notification — it simply stops, and everything
 * downstream keeps serving whatever it last published. That is the same
 * question as the stale Sonar baseline (#58) pointed at CI instead: a thing
 * that stopped working while nothing said so.
 *
 * Read from the Actions API and filtered to `event=schedule`, deliberately.
 * A manual `workflow_dispatch` proves someone ran it by hand, which is not
 * evidence the schedule is alive — and the commit log proves less than that
 * (see the trap in the header).
 *
 * The tolerance is per workflow because cadences differ, and it should be
 * generous: GitHub does not guarantee scheduled start times, and on this repo
 * every measured run of the screener mirror started 4h05m-6h53m late. The
 * alarm is for "has stopped", not "is late".
 */
async function checkWorkflowSchedules(specs) {
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "shift-freshness-check",
  };
  for (const spec of specs) {
    const idx = spec.lastIndexOf(":");
    const file = idx === -1 ? spec : spec.slice(0, idx);
    const maxAgeHours = idx === -1 ? 30 : Number(spec.slice(idx + 1));
    if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
      throw new Error(
        `--workflow ${spec}: max age must be a positive number of hours`,
      );
    }
    requested += 1;
    const runs = await getJson(
      `https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(file)}` +
        `/runs?event=schedule&per_page=1`,
      headers,
    );
    const last = (runs.workflow_runs || [])[0];
    if (!last) {
      check(
        `schedule: ${file} has fired on a schedule`,
        false,
        "no scheduled run on record",
      );
      continue;
    }
    const started = last.run_started_at || last.created_at;
    const { ageHours, stale, reason } = staleBy(started, maxAgeHours);
    check(
      `schedule: ${file} fired within ${maxAgeHours}h`,
      !stale,
      reason ||
        `last scheduled run ${started} (${ageHours.toFixed(1)}h ago, conclusion ` +
          `${safeText(last.conclusion || "none", 40)})`,
    );
  }
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
export async function checkCodeRabbit(prNumber) {
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
      `state=${cr.state} description="${safeText(desc)}"`,
    );
  }

  // 2. The coverage marker, which names the commit that was actually reviewed.
  const comments = await getJson(
    `${api}/issues/${prNumber}/comments?per_page=100`,
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
        "nothing was checked — set SONAR_TOKEN and/or pass --pr <n> / --all-prs / --workflow <f:hours>",
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

/**
 * Every PR the review check should cover, and the counting that goes with it.
 *
 * Split out of `main` so each section there is one line. That keeps `main`
 * readable as a list of what this run is checking, and it is also what took
 * its cognitive complexity back under the limit (SonarCloud javascript:S3776,
 * 16 against 15 allowed, once the third check landed).
 */
async function reviewCoverageSection() {
  if (!GITHUB_TOKEN) throw new Error("--pr and --all-prs need GITHUB_TOKEN");
  const numbers = PR ? [PR] : await openPullRequests();
  if (numbers.length === 0) {
    console.log("\nCodeRabbit review coverage: no open pull requests");
    return;
  }
  for (const n of numbers) {
    requested += 1;
    console.log(`\nCodeRabbit review coverage on PR #${n}:`);
    await checkCodeRabbit(n);
  }
}

/** The Sonar half, with its own `requested` bookkeeping. */
async function sonarSection() {
  requested += 1;
  console.log("SonarCloud baseline:");
  await checkSonar();
}

/** The scheduled-workflow half. `requested` is counted per workflow inside. */
async function scheduleSection() {
  if (!GITHUB_TOKEN) throw new Error("--workflow needs GITHUB_TOKEN");
  console.log(`\nScheduled workflows still firing:`);
  await checkWorkflowSchedules(WORKFLOWS);
}

async function main() {
  // Raised here rather than at module scope — see the note by positiveNumber.
  if (optionError) throw optionError;
  console.log(`freshness-check · repo ${REPO} · sonar project ${PROJECT}\n`);

  // One line per section, each either run or explicitly reported as skipped.
  // A section that says nothing at all is how a check goes quiet unnoticed,
  // which is the failure this whole script is about.
  if (SONAR_TOKEN) await sonarSection();
  else console.log("SonarCloud baseline: skipped (no SONAR_TOKEN)");

  if (PR || ALL_PRS) await reviewCoverageSection();
  else console.log("\nCodeRabbit review coverage: skipped (no --pr/--all-prs)");

  if (WORKFLOWS.length > 0) await scheduleSection();
  else console.log("\nScheduled workflows: skipped (no --workflow)");

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
    console.error(
      `\nfreshness-check could not run: ${safeText(err.message, 500)}`,
    );
    process.exit(2);
  }
}
