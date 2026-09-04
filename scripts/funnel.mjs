#!/usr/bin/env node
/**
 * Prints the recommendation funnel, so the baseline is something someone
 * actually reads rather than something that exists.
 *
 * WHY THIS EXISTS AS A SCRIPT.
 * `docs/funnel.md` carries the queries, but a query you have to open a SQL
 * editor and paste is a query nobody runs on a Tuesday. The numbers are the
 * point of PR #56; a baseline nobody looks at is not a baseline.
 *
 * WHY NOT AN IN-APP PAGE.
 * `funnel_events` has no SELECT grant and no SELECT policy — the browser can
 * write events and cannot read them back (see 0011_funnel_events.sql). Adding
 * a screen means granting the browser read access to everyone's funnel rows to
 * serve a page only the team looks at. A script run with the service-role key
 * keeps the table write-only from the app, which is the property worth having.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *     node scripts/funnel.mjs [--days 30]
 *
 * Exit codes: 0 printed · 2 could not run. There is deliberately no failure
 * exit: an empty funnel is a fact to report, not an error.
 *
 * READING THE OUTPUT — two things that are not bugs:
 *
 *   - Stages 1-3 are counted once per session, stage 4 every time. A click is
 *     an act, not a state, so `events` can exceed `sessions` on that row.
 *   - Every later stage is conditioned on `reco_started`, so a rate can never
 *     exceed 100%. Broker actions from the Connections screen in a session
 *     that never started the flow are counted separately, at the bottom —
 *     a large number there is a real finding about how people reach the
 *     broker, not noise.
 *
 * A rate over an empty denominator prints "—", never "0%". The app's own
 * contract for a price it does not have, applied to its own metrics: a
 * conversion rate we cannot compute is unknown, not zero.
 */

import { pathToFileURL } from "node:url";

export const STAGES = [
  ["reco_started", "1. opened the four questions"],
  ["reco_completed", "2. saw their allocation"],
  ["broker_screen_viewed", "3. reached the broker screen"],
  ["broker_action_clicked", "4. acted on a broker  ← KPI"],
];

/** A percentage, or "—" when the denominator is zero.
 *  Never "0%": that would claim a measured rate of zero where there is
 *  nothing to measure. */
export const rate = (num, den) =>
  den === 0 ? "—" : `${((100 * num) / den).toFixed(1)}%`;

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

/**
 * Rolls raw event rows up into the numbers that get printed.
 *
 * Separated from the printing, and exported, because this is the half that can
 * be quietly wrong. A misprinted table is obvious; a plausible-looking rate
 * computed off the wrong denominator is not — and that exact defect shipped
 * once already on #56, where `pct_acted` could exceed 100% because the
 * numerator counted broker actions the denominator never did.
 *
 * The invariant this function exists to hold: EVERY later-stage count is drawn
 * from sessions that contain `reco_started`, so a numerator is always a subset
 * of its denominator. Sessions that acted without ever starting are not
 * discarded — they are reported separately as `outside`.
 */
export function rollup(rows) {
  /** session_id → stages seen, plus a click tally. */
  const bySession = new Map();
  for (const r of rows) {
    let s = bySession.get(r.session_id);
    if (!s) bySession.set(r.session_id, (s = { stages: new Set(), clicks: 0 }));
    s.stages.add(r.name);
    if (r.name === "broker_action_clicked") s.clicks += 1;
  }

  const sessions = [...bySession.values()];
  const started = sessions.filter((s) => s.stages.has("reco_started"));

  const stages = STAGES.map(([name, label]) => ({
    name,
    label,
    // Conditioned on `started` — the invariant above.
    sessions: started.filter((s) => s.stages.has(name)).length,
    events: rows.filter((r) => r.name === name).length,
  }));

  const outsideSessions = sessions.filter(
    (s) =>
      !s.stages.has("reco_started") && s.stages.has("broker_action_clicked"),
  );

  return {
    events: rows.length,
    sessions: sessions.length,
    started: started.length,
    stages,
    outside: {
      sessions: outsideSessions.length,
      clicks: outsideSessions.reduce((a, s) => a + s.clicks, 0),
    },
  };
}

async function main() {
  const URL = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const argv = process.argv.slice(2);
  const daysArg = argv.indexOf("--days");
  const DAYS = daysArg === -1 ? 30 : Number(argv[daysArg + 1] || 30);

  if (!URL || !SERVICE)
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  if (!Number.isFinite(DAYS) || DAYS <= 0) {
    throw new Error(
      `--days must be a positive number, got "${argv[daysArg + 1]}".`,
    );
  }

  // Imported here rather than at module scope so the rollup below can be
  // unit-tested without the dependency being installed at the repo root —
  // the arithmetic is the part worth testing and it needs no client.
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  // Pull the raw rows once and roll up in memory. The table is small by
  // construction (stages 1-3 are one row per session) and one read keeps the
  // per-session logic in one place rather than spread across four SQL round
  // trips that could drift apart.
  const { data, error } = await db
    .from("funnel_events")
    .select("name, session_id, created_at")
    .gte("created_at", since);

  if (error) throw new Error(error.message);

  const rows = data || [];
  if (rows.length === 0) {
    console.log(`\nNo funnel events in the last ${DAYS} days.\n`);
    console.log(
      "That is either nobody using the flow, or the events not arriving.",
    );
    console.log("The two look identical from here, so check one thing before");
    console.log(
      "concluding the first: that 0011_funnel_events.sql has been run",
    );
    console.log(
      "against this project and an event can be written as `authenticated`.\n",
    );
    return;
  }

  const f = rollup(rows);

  console.log(`\nRecommendation funnel · last ${DAYS} days`);
  console.log(
    `${f.events} events · ${f.sessions} sessions · ${f.started} started the flow\n`,
  );
  console.log(
    `  ${pad("stage", 34)}${lpad("sessions", 9)}${lpad("of started", 12)}${lpad("events", 8)}`,
  );
  console.log(
    `  ${"-".repeat(34)} ${"-".repeat(8)}  ${"-".repeat(10)}  ${"-".repeat(6)}`,
  );

  for (const s of f.stages) {
    console.log(
      `  ${pad(s.label, 34)}${lpad(s.sessions, 9)}${lpad(rate(s.sessions, f.started), 12)}${lpad(s.events, 8)}`,
    );
  }

  // Step-to-step drop, which is where a flow actually loses people — the
  // headline rate hides which step is doing the losing.
  console.log(`\n  step-to-step:`);
  for (let i = 1; i < f.stages.length; i += 1) {
    console.log(
      `    ${pad(`${i} → ${i + 1}`, 12)}${lpad(rate(f.stages[i].sessions, f.stages[i - 1].sessions), 8)}`,
    );
  }

  console.log(
    `\n  broker actions outside the flow: ${f.outside.sessions} session(s), ${f.outside.clicks} click(s)`,
  );

  const first = rows.reduce(
    (a, r) => (r.created_at < a ? r.created_at : a),
    rows[0].created_at,
  );
  console.log(`\n  earliest event in window: ${first}\n`);
}

// Only when run as a command — funnel.test.mjs imports `rollup` and must not
// trigger a network read or a process.exit.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`\nfunnel could not run: ${err.message}`);
      process.exit(2);
    },
  );
}
