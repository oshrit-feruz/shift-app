#!/usr/bin/env node
/**
 * Proves the ledger's Row-Level Security actually isolates users.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT A UNIT TEST:
 * RLS is enforced by Postgres, not by anything in this repo, so there is
 * nothing a vitest run can assert about it — the closest existing test,
 * api/_lib/deleteAccount.test.ts, checks that the server derives the user id
 * from a verified token, which is an authorization test, not an RLS one. The
 * only honest way to know these policies hold is to point two real users at a
 * real project and watch the database refuse.
 *
 * It therefore cannot run in CI without credentials. Treat it exactly like the
 * migrations it verifies: a pre-deploy step run by hand, once, against a
 * staging project — never production, since it creates and deletes users.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *     node scripts/rls-check.mjs
 *
 * Exit code 0 means every assertion held. Non-zero names the one that did not.
 *
 * The service-role key is used only to create and delete the two throwaway
 * users. Every assertion below runs through the ANON key with a user's own
 * access token, which is exactly what the browser has — testing with the
 * service role would bypass RLS and prove nothing.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failures = 0;

/** One assertion. Prints its outcome and remembers a failure without stopping —
 *  a run that halts on the first problem hides the other four. */
function check(name, passed, detail = "") {
  if (passed) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A row that was refused, whichever way Postgres chose to refuse it.
 *
 *  RLS denies a SELECT by returning no rows rather than an error, and denies a
 *  write with 42501. Both are the policy working; only data coming back is a
 *  failure. */
const refused = (result) =>
  Boolean(result.error) || (result.data ?? []).length === 0;

async function createUser(email) {
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error)
    throw new Error(`could not sign in ${email}: ${signIn.error.message}`);
  return { id: data.user.id, client };
}

async function main() {
  const stamp = Date.now();
  const a = await createUser(`rls-a-${stamp}@example.invalid`);
  const b = await createUser(`rls-b-${stamp}@example.invalid`);

  try {
    // The signup trigger should already have given each of them a Sandbox.
    const aPortfolios = await a.client
      .from("portfolios")
      .select("id,is_default");
    check(
      "the signup trigger provisions exactly one Sandbox",
      !aPortfolios.error &&
        (aPortfolios.data ?? []).filter((p) => p.is_default).length === 1,
      aPortfolios.error?.message,
    );
    const sandboxA = (aPortfolios.data ?? []).find((p) => p.is_default);
    if (!sandboxA)
      throw new Error("no Sandbox for user A — run 0005_ledger.sql first");

    const txA = `tx-rls-${stamp}`;
    const insert = await a.client.from("transactions").insert({
      id: txA,
      user_id: a.id,
      portfolio_id: sandboxA.id,
      side: "buy",
      ticker: "NVDA",
      shares: 10,
      price: 100,
      trade_date: "2026-08-20",
    });
    check(
      "a user can record a transaction in their own portfolio",
      !insert.error,
      insert.error?.message,
    );

    check(
      "B cannot read A’s portfolios",
      refused(
        await b.client.from("portfolios").select("id").eq("id", sandboxA.id),
      ),
    );
    check(
      "B cannot read A’s transactions",
      refused(await b.client.from("transactions").select("id").eq("id", txA)),
    );

    // The one the foreign key does NOT cover: FKs are validated by the system,
    // which does not apply RLS, so without the `exists` clause in the insert
    // policy B could file a row into A's portfolio. B could never read it
    // back — but A would see it appear in their holdings.
    const cross = await b.client.from("transactions").insert({
      id: `tx-cross-${stamp}`,
      user_id: b.id,
      portfolio_id: sandboxA.id,
      side: "buy",
      ticker: "AMD",
      shares: 1,
      price: 1,
      trade_date: "2026-08-20",
    });
    check(
      "B cannot file a transaction into A’s portfolio",
      Boolean(cross.error),
      "insert succeeded",
    );

    const impersonate = await b.client.from("transactions").insert({
      id: `tx-asa-${stamp}`,
      user_id: a.id,
      portfolio_id: sandboxA.id,
      side: "buy",
      ticker: "AMD",
      shares: 1,
      price: 1,
      trade_date: "2026-08-20",
    });
    check(
      "B cannot insert a row stamped as A",
      Boolean(impersonate.error),
      "insert succeeded",
    );

    await b.client.from("transactions").delete().eq("id", txA);
    const survived = await a.client
      .from("transactions")
      .select("id")
      .eq("id", txA);
    check(
      "B's delete does not remove A’s transaction",
      (survived.data ?? []).length === 1,
    );

    // A row is immutable: no update policy exists on transactions at all, and
    // the client's whole sync design depends on that staying true.
    const update = await a.client
      .from("transactions")
      .update({ shares: 999 })
      .eq("id", txA);
    const afterUpdate = await a.client
      .from("transactions")
      .select("shares")
      .eq("id", txA)
      .single();
    check(
      "even its owner cannot update a transaction",
      Boolean(update.error) || Number(afterUpdate.data?.shares) === 10,
      "shares changed",
    );

    // Since 0006 the Sandbox is ordinary user content too: its owner can
    // delete it (the app confirms first), and the policy must let them, or
    // the delete would affect no rows, report no error, and the Sandbox
    // would come back on the next read.
    await a.client.from("portfolios").delete().eq("id", sandboxA.id);
    const sandboxStill = await a.client
      .from("portfolios")
      .select("id")
      .eq("id", sandboxA.id);
    check(
      "Sandbox can be deleted by its owner (0006)",
      (sandboxStill.data ?? []).length === 0,
    );

    // Any other portfolio is ordinary user content and must be removable, or
    // the "delete" button is a lie.
    const ownId = `manual-rls-${stamp}`;
    await a.client
      .from("portfolios")
      .insert({ id: ownId, user_id: a.id, name: "Ideas" });
    await a.client.from("portfolios").delete().eq("id", ownId);
    const gone = await a.client.from("portfolios").select("id").eq("id", ownId);
    check(
      "a non-default portfolio can be deleted by its owner",
      (gone.data ?? []).length === 0,
    );

    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    check(
      "a signed-out visitor sees nothing",
      refused(await anon.from("portfolios").select("id")),
    );
    check(
      "a signed-out visitor sees no transactions",
      refused(await anon.from("transactions").select("id")),
    );
  } finally {
    // Cascades take the ledger rows with them.
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
  }
}

main().then(
  () => {
    console.log(
      failures === 0 ? "\nRLS holds." : `\n${failures} assertion(s) failed.`,
    );
    process.exit(failures === 0 ? 0 : 1);
  },
  (err) => {
    console.error(`\nrls-check could not run: ${err.message}`);
    process.exit(2);
  },
);
