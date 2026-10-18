# Loading performance — 19 October 2026

The optimizations work with the existing free hosting plan. No new paid
service, dependency, environment variable, database migration or hosting change
is required. Source changes still need the owner's manual VS Code commit/push
and a successful Netlify redeployment.

## What was slow

- The owner confirmed that Netlify functions run in CMH (Ohio). The configured
  Supabase runtime pooler is in Seoul. Database requests therefore cross regions.
  The owner's Netlify plan does not allow changing the function region without
  upgrading; the region was left unchanged.
- Account authorization used chained account/partner/application reads.
- The browser requested overview, notifications, choices, workspaces and earnings
  separately after loading and hydrating the page. Those requests repeated
  authorization. Choices were fetched even on screens that did not use them.
- The overview performed many separate aggregate and relation queries.
- Read-only API requests loaded spreadsheet, image-processing and push libraries
  eagerly. The main portal also imported panels that the current screen did not
  need.
- The public homepage waited for its rate-card database read before rendering.

These observations explain avoidable work. They do not prove that geography
alone causes every delay; function startup, Clerk, connection establishment,
the device and its network also affect the full page load.

## Implemented

1. Parameterized joined account reads, selecting only the fields used by the
   role policy. Staff grants are still checked on each request; React `cache`
   only deduplicates authorization within the current server render.
2. One overview aggregate query and one joined recent-package query, preserving
   tenant scope, milestone dates, saved fees and all-time outstanding debt.
3. Admin, Partner and Rider initial data comes directly from the authorized
   server query functions with the page. Matching client request keys avoid an
   immediate repeat fetch. Refresh, visible-page polling, search, pagination,
   role checks and deletion invalidation remain available.
4. Partner/rider choices load when import or the appropriate dialog needs them.
   Independent choices queries run in parallel. The workspace switcher uses the
   server's choices first and continues to recheck them on focus and polling.
5. Optional panels/dialogs use `next/dynamic`; spreadsheet, receipt/logo and push
   transports are imported when their API branch needs them.
6. Partner and Rider loading boundaries provide a navigation shell. The landing
   page streams its public rate cards separately and caches only public rate
   labels/prices for 60 seconds. Successful admin rate edits invalidate that
   cache. The motion observer also discovers streamed cards, preserving their
   individual repeatable scroll reveals after the rate data arrives.

There is no persistent shared cache of accounts, role permissions, packages,
invoices, balances, payments or private notifications. This work makes no
financial or operational status changes.

## Measurements

Read-only profiling used the configured database, a pool of five and an existing
super-admin identity. It printed timings and query counts only. It did not call
Clerk, provision accounts, change data or print identity/connection values.

| Measured path | Before: SQL queries | After: SQL queries |
| --- | ---: | ---: |
| Super-admin account lookup | 3 | 1 |
| Overview including account lookup | 20 | 3 |
| Initial admin data including account lookup | 41 | 10 |

The original initial-data sample simulated the five browser requests listed
above. The new sample reads only the resources required by the server-rendered
overview. The 41 → 10 reduction is approximately 76% fewer queries for this
specific path; other pages and staff roles have different counts.

The original warm account lookup took 403 ms; final repeated samples took
128–133 ms. The original initial-data sample took 1,162 ms. Three final samples
took 1,072–1,120 ms, while an additional repeat using fully established pooled
connections took 399 ms. The original path did not receive that same additional
warm repeat, so the 399 ms result is not a fair whole-page speed comparison.
First connections still took roughly 1.3–1.4 seconds in these runs.

These are developer-machine-to-database timings, not hosted Ohio-to-Seoul
measurements, browser Core Web Vitals or a guaranteed improvement percentage.
Before edits, a read-only public-site sample returned the homepage in about
4.4 seconds initially and 0.86 seconds on repeat. No optimized deployment or
authenticated hosted after-measurement has been performed.

To repeat the current read-only profiler from `apps/admin`:

```sh
node --conditions=react-server --import tsx scripts/measure-delivery-performance.ts
```

Use the same environment, role, dataset and connection warmness when comparing
future changes. Database work and browser performance are different measures.

## Verification

- All 68 retained unit tests pass.
- The complete 113-check integration regression passes in a disposable schema.
  That run started before the final recent-package join was added; the final
  join was covered separately by the six-check suite below.
- Six focused performance-correctness database checks pass: identity DTO and
  role equivalence, scoped/serialized initial data, invalid date handling,
  resource selection, rider assignment without implicit pickup, exact recent
  package relation DTOs including a delivered/invoiced package, and immediate
  admin grant revocation. The checks group related assertions into six results.
- The final ten-check dashboard/date-period suite passes with the joined recent
  query: date boundaries, ten-row pagination, tenant isolation, outstanding debt,
  verified income and full manual invoice eligibility remain correct.
- All disposable schemas were removed. Live operational records were not
  modified by these tests.
- Actual client components were checked with fictional transports and Clerk/Next
  substitutes. Admin, Partner and Rider matching initial payloads produced zero
  immediate data requests. Manual refresh still fetched current resources;
  opening admin registration fetched choices on demand. A month-filtered Partner
  overview also used its matching initial payload. This fixture does not verify
  a real Clerk session or hosted Next.js navigation.
- ESLint, whitespace checks and the single-worker production build, including
  TypeScript, pass. The final build status is also recorded in verification.md.
- The actual local production homepage was opened with its normal Clerk
  middleware. The main content rendered with the rate skeleton first, and the
  real database rate cards then replaced that skeleton. This is a public local
  check; authenticated hosted walkthroughs and hosted timings remain pending.

## After deployment

1. Commit/push the changes manually and let Netlify finish the production build.
2. Check Admin overview, Partner overview and Rider collections. Check Refresh,
   another month, the next page and registration/assignment dialogs.
3. In browser developer tools, compare a fresh load and a repeat load. Record
   the document response, time until real data appears and the number/duration
   of `/api/delivery/` requests. Initial page data should no longer be fetched
   again immediately; subsequent polling/refresh calls are expected.
4. Test on a real phone/network and in a signed-in session. Keep development and
   production build results separate. Do not share cookies, tokens or private
   package responses when reporting timings.

The free-plan region mismatch remains. A future database-region migration would
require a separately planned backup, database and Storage migration, credential
updates and validation. It was not attempted as part of these code improvements.

## Official references researched

The installed Next.js version is 16.3.8. Its bundled guidance was read before
editing; current online guidance was also checked (the website identified
16.4.2 as latest). No framework upgrade or experimental relation-join feature
was required.

- [Next.js production checklist](https://nextjs.org/docs/app/guides/production-checklist):
  server data access, parallel requests, streaming and smaller client boundaries.
- [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading):
  conditional client panels and dynamic library imports.
- [Next.js prefetching](https://nextjs.org/docs/app/guides/prefetching):
  loading boundaries for dynamic routes.
- [Next.js caching without Cache Components](https://nextjs.org/docs/app/guides/caching-without-cache-components):
  request memoization and caching database queries without shared private data.
- [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/#region):
  function regions and framework-generated function configuration. The owner's
  actual account restriction prevented the proposed Tokyo switch.
