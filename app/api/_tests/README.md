# Why the route tests live here

Vercel turns every `.ts` file under `api/` into its own Serverless Function,
test files included — and the Hobby plan allows **12 per deployment**. With the
suites beside their routes that ceiling counted each route twice, and adding the
seventh route (`/api/intraday`, the chart's 1D tab) took the deployment to 14
and failed it outright with `exceeded_serverless_functions_per_deployment`.
Nothing was wrong with the code; the build succeeded and the deploy step
refused it.

A leading underscore is Vercel's own convention for a path under `api/` that is
not an endpoint — the same reason `api/_lib/` has never been deployed — so
moving the suites here takes them out of the count without hiding them from
anything that matters: `npm test` finds them by glob, and `npm run typecheck:api`
covers this directory through `api/tsconfig.json`'s `include`.

**So: a new route's tests belong in here, not next to the route.** A file added
as `api/whatever.test.ts` deploys as a public endpoint and spends one of the
twelve.
