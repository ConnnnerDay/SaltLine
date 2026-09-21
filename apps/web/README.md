# apps/web

The canonical Next.js backend-for-frontend named by
[`docs/CANONICAL_ROADMAP.md`](../../docs/CANONICAL_ROADMAP.md)'s technical
contract: mobile-first, deployed to Vercel, the only thing the browser
talks to. The browser must never call `apps/api` (FastAPI) directly — this
app authenticates the user and signs the internal request instead.

## Status

**Sprint 47 ("Degraded-mode UX")**: "Database/API/email/upstream chaos
yields actionable UI." Found three real gaps by actually breaking each
dependency this session had the means to break (a stopped local
Postgres, a stopped `apps/api`), not by inspection alone, and fixed
each:

- `app/components/forecast-card.tsx`'s `ForecastErrorCard` used to dump
  the raw caught error (`err.message` -- e.g. plain `fetch failed` for
  a network error apps/api never even got to respond to) straight into
  the page, plus an *unconditional* dev-only troubleshooting paragraph
  naming internal implementation details ("Is apps/api running
  (`uvicorn app.main:app`)...", env var names, a link to this README)
  to every visitor, in every failure case -- confusing at best, a real
  internal-implementation disclosure at worst, for an actual visitor
  hitting a genuine production outage rather than a developer running
  `next dev`. Now gated on `process.env.NODE_ENV` (a Server Component
  reading its own process's env, not visitor-controlled): production
  gets one honest, generic message and a real "Try again" retry link
  (a new `retryHref` prop threaded through `ForecastPageBody` from both
  `app/forecast/[locationId]/page.tsx` and `app/share/[locationId]/
  page.tsx`, each pointing at its own URL); the raw message and dev
  troubleshooting text still show in development, unchanged from
  before for that audience.
- `app/preferences/preferences-form.tsx` used to share one `error`
  string between a *load* failure and a *save* failure, rendered as if
  it were a validation message on the last field ("Default location
  ID") -- actively misleading for a load failure, unrelated to that
  field, and worse: the form still rendered normally with `EMPTY`
  defaults a user could unknowingly submit and overwrite their real
  saved preferences with, no warning that's what "Save" would do. Split
  into distinct `loadError`/`saveError` state: a load failure now
  replaces the whole form with a retryable error card (never renders
  `EMPTY` as if it were real data), a save failure shows as its own
  form-level status line rather than attached to an unrelated field.
- `lib/auth.ts`'s `sendResetPassword`/`emailVerification
  .sendVerificationEmail` hooks called `lib/email.ts`'s SMTP send with
  no `try`/`catch` -- a transient SMTP outage would have failed the
  registration or password-reset *request itself*, even though the
  account operation it's attached to had already succeeded. Wrapped in
  `try`/`catch`, logged server-side, never rethrown: Better Auth's own
  forgot-password client flow already shows the same generic "check
  your email" message regardless of real delivery (an account-
  enumeration precaution, not something this changes), so swallowing a
  send failure here doesn't hide anything a successful send would have
  told the visitor either.

Upstream (NWS/NOAA/CO-OPS/NDBC) chaos was checked too, using this
sandbox's own always-blocked network to those domains as free, live
evidence rather than simulating it -- already solid from sprints 21-26,
rendering honest per-source `unavailable` labels via the existing
`SourceStatus`/confidence machinery, not a crash or invented data nor
anything this sprint needed to touch. `apps/api`'s own half of this
sprint (a global unhandled-exception handler, so this app's error
surfaces above have a small, safe, predictable body to work with
instead of Starlette's raw default) is in that service's own README.

Verified live, not just by reading the diff: registered a real account
against real local Postgres/apps/api servers, stopped `apps/api`, and
confirmed the production-build forecast/share pages show the new clean
message with a working retry link and no leaked internal details (a
parallel `next dev` run confirmed the dev-only detail still shows
there); loaded `/preferences` with `apps/api` down and confirmed the
retryable error card, not a silently-editable empty form; restarted
`apps/api` and confirmed both the retry path and a fresh page load
recover normally. `npm run lint`/`build` both clean.

**Sprint 38 ("PWA baseline")**: full offline app-shell navigation with
graceful degradation, not just last-cached-forecast viewing -- and
authenticated forecasts aren't cached forever. `docs/
R1_RECONCILIATION_AUDIT.md`'s §3.5 disposition for this row was "adapt
the requirement, replace the implementation": v2's `vite-plugin-pwa`
config only cached the last-loaded forecast (and its `/api/*` cache
rule's URL pattern didn't even match this app's real request paths --
a latent bug, not something worth porting), so this is a from-scratch
build under Next.js 16 tooling, not an adaptation of that code.

Two complementary pieces, covering the two kinds of offline navigation:

- `experimental.useOffline` (`next.config.ts`) -- Next 16's own
  (experimental) connectivity-aware retry for *soft*, already-hydrated
  in-app navigations, prefetches, and Server Actions. `app/
  offline-banner.tsx` surfaces the `useOffline` hook it exposes as a
  site-wide "You're offline" banner in the root layout, adapted
  directly from `node_modules/next/dist/docs/01-app/02-guides/
  offline-support.md`'s own example. This alone doesn't cover a hard
  reload or an installed PWA's cold launch -- the guide says so
  explicitly ("full offline loads would need a service worker").
- `public/sw.js` -- a hand-written service worker (not Workbox/Serwist:
  no bundler-level SW build step exists in this app, and Next's own
  docs name Serwist as *one option*, not a requirement) for exactly
  that full-navigation case. Runtime caching, not precaching: Turbopack's
  build output is content-hashed per build, so a static precache list
  of asset URLs would go stale on every deploy -- pages get cached only
  as they're actually visited, and only within an explicit allow-list
  (`/`, `/locations`, `/forecast/*`, `/share/*`) that deliberately
  excludes `/saved`/`/preferences`/`/account`: those render a signed-in
  user's own personal data into the HTML, and Cache Storage is shared
  across every account that ever signs into a given browser profile,
  not scoped per session -- caching them risks a cross-account leak on
  a shared device. `/forecast/*` and `/share/*` (the two routes that
  embed live scored conditions) additionally carry a stamped
  `x-saltline-cached-at` header and a 4-hour TTL (`FORECAST_TTL_MS`,
  matching `docs/product-definition.md`'s existing freshness-window
  decision, the same value `apps/api`'s `SnapshotCache` already
  defaults to) -- past that age, a cached copy is more likely to
  mislead than help, so it's treated as a miss rather than served,
  satisfying this sprint's "authenticated forecasts not cached forever"
  requirement literally. A new `app/offline/page.tsx` (real Saltline
  chrome, not a raw string) is what the worker serves for anything it
  can't fulfill -- an unvisited URL, or a `forecast`/`share` entry past
  its TTL -- instead of the browser's native offline error. `app/
  service-worker-registration.tsx` registers it, production builds
  only (a service worker caching `next dev`'s unstable dev bundles
  would fight hot-reload).

Verified against real infrastructure, not emulated: Chromium's
per-target network-offline emulation (`browserContext.setOffline`)
doesn't reliably reach a service worker's own `fetch()` calls (it runs
in a separate CDP target from the page), so this was tested by actually
stopping the `next start` process -- a real connection-refused, not a
simulated one -- with a persistent browser profile carried across the
process restarts so the installed worker and its Cache Storage survive
them the way a real browser session would. With the server down: a
previously-visited `/share/wrightsville-beach-nc` reload served its
real cached content; a never-visited `/share/cocoa-beach-fl` rendered
the real `/offline` page, not a browser error. Restarting the server
made the previously-failed URL render live again. Separately, the
4-hour TTL was exercised without waiting four real hours: the cached
entry's own `x-saltline-cached-at` header was rewritten (via the page's
own `caches` API, the same interface the worker itself uses) to look
5 hours old, and with the server down again, that same URL now
correctly rendered `/offline` instead of the stale forecast -- proving
the staleness check itself works, not just that the happy path does.
`axe-core` on `/offline`, both color schemes: 0 violations. `npm run
lint`/`build` both clean.

**Sprint 30 ("Onboarding shell")**: closes the gap `app/register/
page.tsx`'s own docstring had flagged since sprint 28 -- registration
alone was "nothing here is a real profile/onboarding flow." A brand-new
user finishing signup used to land back on `/` (the marketing homepage,
`next`'s old default), the same "Find your spot" CTA they'd already
seen pre-signup. Now `RegisterForm` routes through a new `/onboarding`
page instead, carrying the real destination forward as its own
`?next=` (default `/locations`, not `/` -- a first-run user has nothing
saved yet, so the search page is the real destination, matching
`docs/product-definition.md`'s "First-run success: a new user can
register, choose a coastal point, and quickly understand whether and
when to fish").

`app/onboarding/page.tsx` is a static four-step mobile-first carousel,
adapted from `v2/frontend/src/pages/Onboarding.tsx`'s concept per
`docs/R1_RECONCILIATION_AUDIT.md`'s row for this sprint (`Step X of N`,
Back/Next, a final step whose button reads "Get started" and links to
`next`) -- but not its copy: v2's steps promised ranked species and rig
recommendations, which `docs/CANONICAL_ROADMAP.md`'s "Deferred until
production evidence" list explicitly excludes from v1. These three
steps instead restate `app/page.tsx`'s own three value props (one clear
verdict, every source shown, best hour) so onboarding never promises
anything the product doesn't already do today. No new persisted state
(no `onboarding_completed` column/migration): nothing in
`docs/product-definition.md`'s "V1 capabilities" preferences list names
onboarding-seen tracking, and the flow only ever needs to run once,
right after a real signup -- a fresh `/onboarding` visit is harmless
(the same static content every time), not a security boundary, so it
isn't session-gated either.

Login (`app/login/page.tsx`) is unchanged and still goes straight to
`next` -- onboarding is only for a signup that just happened, not every
return visit.

Verified end-to-end against real running `next start`/`uvicorn`/local-
Postgres servers with a real Playwright-driven mobile browser (390×844
viewport, matching an iPhone-class device) recording video, not just a
manual click-through: register a real account → land on `/onboarding`
→ step through all four steps (and back) → "Get started" → land on the
real session-gated `/locations` page, confirmed by URL and by the
account menu rendering (proving the session survived the redirect
chain, not just that no error was thrown). Run twice, light and dark.
A fresh `axe-core` sweep on the first and last onboarding step, both
color schemes, found 0 violations. `npm run lint`/`build` both clean.

**Sprint 45 ("Privacy and deletion")**: self-service data export and
account deletion -- required at v1 launch per the round-2 product
decision (a public product with real accounts), not deferred with the
rest of this row. "Legal pages" (actual Terms of Service/Privacy Policy
copy), that row's other named piece, needs real legal review this
session can't supply -- flagged the same way sprint 28's CAPTCHA
credentials gap is flagged, not guessed at.

`lib/auth.ts` enables Better Auth's built-in `user.deleteUser` (off by
default), confirmed via the current password rather than Better Auth's
email-verification-token alternative -- a second, SMTP-dependent flow
would only add complexity for a feature that already has a real,
standard safeguard. Its `beforeDelete` hook calls apps/api's new
`DELETE /v1/me` *before* Better Auth removes the `auth`-schema account
row, so the `forecast`-schema data (preferences, saved locations) never
outlives the account that owns it -- the two schemas ADR-006 splits
between apps have no shared foreign key to cascade this automatically.

New `/account` page (session-gated the same way `/preferences` is, and
now linked from the account menu alongside it) -- deliberately its own
page, not folded into `/preferences`: that page is forecast-related
settings, this one is account management with its own destructive
action that shouldn't sit next to a routine settings form. "Export your
data" is a plain link to a new `app/api/account/export/route.ts` BFF
route (`Content-Disposition: attachment`, merging Better Auth's own
account fields -- email, name, created-at, never a password hash --
with apps/api's `GET /v1/me/export`); "Delete your account" is a
two-step reveal (a confirm button, then a password field and a second,
explicit "Yes, delete my account" button) rather than a one-click path
for an irreversible action, surfacing Better Auth's own error message
on a wrong password. `app/robots.ts` gained the real gap this created:
`/account` is session-gated the same as `/preferences`/`/saved` and now
sits in the same `Disallow` list.

Verified end-to-end against real running `next start`/`uvicorn`/local-
Postgres servers, not just wired: registered, set real preferences and
saved a real location, downloaded the export and confirmed it's the
real merged data (not a stub), confirmed a wrong password on delete is
rejected and shows an error, then deleted the account for real with the
correct password -- confirmed via direct SQL against *both* Postgres
schemas that every row (the `auth.user` row and its `forecast.
user_preferences`/`forecast.saved_location` rows) was actually gone
afterward, and confirmed logging back in with the same credentials is
rejected. A fresh `axe-core` sweep (desktop/mobile × light/dark, the
delete-confirmation form open in every combination) on `/account` found
0 violations and no overflow; the account menu's now-four items
(Preferences/Saved spots/Account/Sign out) still fit cleanly at 360px.
`npm run lint`/`build` both clean.

**Sprint 31, closed out ("Location search" -- device geolocation)**:
text search (`LocationSearch`) already existed; its own docstring named
device geolocation, map search, and station-preview/ambiguity states as
deliberately not attempted. Device geolocation closes out now: apps/api
already had everything needed (`POST /v1/locations/resolve` already
accepted a raw `lat`/`lng` point, no backend work required), so this is
entirely `apps/web` -- a new `app/api/locations/resolve/route.ts` BFF
proxy (session-gated the same way `app/api/locations/search/route.ts`
is) and `app/components/use-my-location-button.tsx`, added to
`app/locations/locations-search.tsx` below the search box. Unlike a
text-search result (which shows a confirmation card, since a query can
return several candidates), a geolocation reading resolves to exactly
one point deterministically, so this navigates straight to
`/forecast/[locationId]` rather than adding a confirmation step with
nothing to actually confirm. `navigator.geolocation`'s own error codes
map to distinct, readable messages (permission denied vs. timeout vs.
unavailable) rather than one generic failure string.

Caught and fixed a real, self-inflicted bug during end-to-end
verification: sprint 44's `next.config.ts` `Permissions-Policy` header
shipped with `geolocation=()` (fully closed), correctly anticipated at
the time as "sprint 31's still-open device-geolocation sub-item is the
natural point to loosen this" -- and a real browser genuinely enforced
it, silently blocking `navigator.geolocation` entirely (a
`Permissions policy violation`, not a JS error a type checker or unit
test would catch). Fixed by scoping it to `geolocation=(self)` — first-
party only, matching the legacy app's own precedent for the same
feature; `camera`/`microphone` stay fully closed since nothing uses
either.

Verified end-to-end against real running `next start`/`uvicorn`/local-
Postgres servers, with real Playwright-injected device coordinates: a
granted-permission click resolves and calls the real apps/api endpoint
(confirmed via request/response interception) and correctly hits a real
`422` for this sandbox's blocked-network `gate_coastal_point` check
(the same class of limitation as this session's other sprints' live-
upstream-dependent features, not a bug here) with a clear on-page
message; a denied-permission click shows the permission-denied message
and stays put. Verified the actual success path — parsing a resolved
location and navigating to its real forecast URL — with a mocked BFF
response (this repo's established "temporary mock" technique for a
live-network-blocked path, via Playwright request interception rather
than a throwaway page this time). A fresh `axe-core` sweep (desktop/
mobile × light/dark, 4 combinations) on `/locations` found 0 violations
and no overflow. `npm run lint`/`build` both clean.

**Sprint 44, closed out ("Security hardening" -- CSRF, brute-force,
threat model)**: that row's own note said CSRF/brute-force needed
Better Auth (sprint 28) and real mutating authenticated endpoints
(sprints 36/37) to be meaningful before they existed -- both do now.
Brute-force defense on login/registration was already real (Better
Auth's per-action rate limiting, sprint 28). CSRF gets two independent
layers on every route with real per-user data:
`lib/require-session-user-id.ts` (shared by `app/api/preferences/
route.ts` and `app/api/saved-locations/route.ts`) already relied on the
session cookie's own `SameSite=Lax` policy; this sprint adds an
explicit `Origin` header check there too (`403` on mismatch,
`ADR-005`'s literal "state-changing web routes enforce origin and CSRF
validation"), so the app doesn't depend on cookie policy alone. Verified
live against real running `next start`/`uvicorn`/local-Postgres
servers, not just configured: a real cross-site `<form>` POST (the
actual CSRF vector -- not subject to CORS the way `fetch` is, so this
isn't a CORS-only claim) got no session cookie attached at all and was
rejected before reaching a route handler; a second test manually
attached a valid session cookie to a request carrying a forged `Origin`
header and got an explicit `403 origin mismatch`, proving the new check
is a real second layer rather than redundant with the cookie policy; a
legitimate same-origin request still succeeds normally (confirmed a
real save still returns `201`). `docs/THREAT_MODEL.md` (new) is this
row's last named piece: a boundary-by-boundary threat/mitigation/
evidence table across browser↔BFF, BFF↔FastAPI, FastAPI↔external
providers, and the database, each mitigation citing the real file or
test behind it, plus an explicit accepted-residual-risk section (the
CAPTCHA gap, no WAF/DDoS layer, no continuous dependency scanning, and
this environment's own blocked-network limits on testing live-upstream
threats) rather than only listing what's covered. `npm run lint`/`build`
both clean.

**Sprint 49, closed out ("SEO and sharing" -- the real sitemap.xml)**:
`app/robots.ts`'s own docstring had been explaining, since that sprint
first shipped, why it emitted no `sitemap` directive -- no endpoint
could enumerate every curated location, only
`/v1/locations/search`'s query-based lookup. `GET /v1/locations`
(apps/api, same change) closes that gap; `app/sitemap.ts` calls it and
builds one URL per curated location's public, non-personalized
`/share/[locationId]` page (sprint 49's actual organic-growth surface
-- `/forecast/*` stays session-gated and out of the sitemap, same as
`robots.ts`'s existing `Disallow`) plus the home page, with `dynamic =
'force-dynamic'` for the same reason `app/forecast/[locationId]/
page.tsx` needs it: a CI build never sets `INTERNAL_SIGNING_KEY_ID`, so
prerendering this at build time would fail the same way an
unconfigured live request would, not a real "it works" signal.
`robots.ts` now points `sitemap` at it, and picked up a real gap found
along the way: `/saved` (sprint 37, added after `robots.ts`'s
`Disallow` list was last reviewed) is session-gated exactly like
`/preferences` but wasn't in that list -- added. Verified against real
running `next start`/`uvicorn`/local-Postgres servers: `/sitemap.xml`
returns exactly 102 `<url>` entries (101 curated locations + the home
page, matching the dataset's real size, not a guess), two sampled
`/share/*` URLs from it both resolve `200`, and `/robots.txt` carries
the real `Sitemap:` line and the corrected `Disallow` list. `npm run
lint`/`build` both clean.

**Sprint 32, closed out ("Dashboard hierarchy" -- the multi-location
dashboard)**: sprint 32's own docstring named this as its one remaining
piece, deferred until sprint 37's saved locations existed to list.
`app/saved/page.tsx` now fetches each saved location's own forecast
server-side, in parallel (`Promise.all`, one `fetchForecast` call per
location -- the same call `app/forecast/[locationId]/page.tsx` makes),
calling `/v1/me/locations` directly rather than round-tripping through
`app/api/saved-locations/route.ts`'s own BFF proxy, since the page is
already server code. `app/components/forecast-card.tsx`'s
`VERDICT_TO_BADGE`/`deriveBestWindow` are now exported (plus a new
`formatBestWindowRange`, factored out of the full card's
`BestWindowCallout` so both callers share one time-formatting
implementation) so `app/saved/saved-locations-list.tsx`'s per-location
row uses the exact same verdict-badge and best-window mapping the full
forecast page does, not a second one invented for this list. A location
whose own forecast fetch fails renders its name/state/link with a plain
"Forecast unavailable" note rather than taking down the whole dashboard
over one bad source; `SavedLocationsList` itself changed from a
client-fetch-on-mount component to one taking server-fetched initial
data as props (delete still goes through the client-side BFF proxy and
just updates local state), removing the loading-skeleton flash the old
version had on every visit. Verified end-to-end against real running
`next start`/`uvicorn`/local-Postgres servers: registered, saved a real
spot, and confirmed `/saved` renders its actual verdict badge and a
real best-window callout ("Best 7:00 AM – 10:00 AM", computed from
`hourly_outlook`, which per sprint 34 never degrades to `null` even
though `conditions.score` stays `Unknown` on this sandbox's
blocked-upstream path) rather than a mock. A fresh `axe-core` sweep
(light/dark, plus a 360px phone width) found 0 violations and no
horizontal overflow. `npm run lint`/`build` both clean.

**Sprint 37 ("Saved locations")** -- the roadmap's "users can save
locations (free tier: 1)" row, the UI half of apps/api's matching new
`/v1/me/locations` endpoints. `lib/require-session-user-id.ts` is
`app/api/preferences/route.ts`'s own inline session check, extracted so
the new `app/api/saved-locations/route.ts` (`GET`/`POST`) and
`app/api/saved-locations/[id]/route.ts` (`DELETE`) BFF proxies share it
instead of each duplicating it. Caught a real bug in
`lib/internal-api-client.ts` along the way: it unconditionally called
`response.json()`, which throws on the `DELETE` endpoint's `204 No
Content` -- fixed with an explicit status check before parsing.

`SaveLocationButton` (`app/components/save-location-button.tsx`) sits on
the (now account-gated, sprint 29) forecast page and deliberately
doesn't check on page load whether a spot is already saved -- that would
cost every forecast page load an extra apps/api round trip for a
property that rarely changes. Instead a click always ends in "Saved"
state whether apps/api returned `201` (just saved) or `409` (already
was) -- from the visitor's side those mean the same thing. `/saved`
(`app/saved/page.tsx`, session-gated the same way `/preferences` is) and
`app/saved/saved-locations-list.tsx` are the "view/remove" half: fetch
on mount, a remove button per row, and an empty state pointing back at
`/locations`.

Replaced `AuthStatus`'s flat "name link (desktop-only) + sign out
button" with a real `role="menu"` dropdown now that there are two
destinations to fit (Preferences, Saved spots) plus sign out -- more
than three bare siblings can share a row at phone width without
reintroducing the exact crowding sprint 28 fixed once already (see that
sprint's entry below). First pass used an icon-plus-name trigger capped
at `max-w-[9rem]`, and end-to-end verification (a real Playwright
browser at a real 360px phone width, not just the design-system page)
caught that this still regressed the crowding: a longer name truncates
correctly *inside* its own box, but a fixed-width box that's still too
wide overflows the row regardless of what's inside it. Fixed the same
way sprint 28 originally did -- the name is hidden below `sm`, so the
account trigger is icon-only (`aria-label="Account menu, {name}"`, so
it's still a labeled target) at phone width, and only grows to
icon+name once there's room.

Verified end-to-end against real running `next start`/`uvicorn`/local-
Postgres servers: registered, saved a spot from `/forecast`, saw it on
`/saved`, removed it back to the empty state, and confirmed a duplicate
save (409) still ends in the same "Saved" UI state as a fresh one. The
account menu's Saved spots/Preferences/Sign out items all work, and the
icon-only mobile trigger still opens the same menu with no page-level
horizontal overflow at 360px (confirmed with an intentionally long
display name, not just the short ones earlier passes happened to use).
A fresh `axe-core` sweep of the forecast page (light/dark) and `/saved`
found 0 violations. `npm run lint`/`build` both clean.

**Sprint 29 ("Account-required routing")**, and the resulting split of
sprint 49's public share page -- `docs/product-definition.md`'s
"account is required for the core forecast experience"/"core browsing
requires a verified account" read literally: `/locations` (search) and
`/forecast/[locationId]` (the per-location lookup) now both check the
session server-side and `redirect('/login?next=<path>')` before any
fetch or client code runs for an anonymous visitor -- the same pattern
`/preferences` already used, now applied to the two pages that are
actually the "core" experience. `app/locations/page.tsx` split into a
thin server wrapper (the session check) and `app/locations/
locations-search.tsx` (the existing client component body, unchanged)
-- a page needs `'use client'` for `useState`, but the redirect has to
happen server-side, before that client code ever reaches an
unauthenticated visitor. `app/api/locations/search/route.ts` (the BFF
proxy the search page calls) got its own independent session check too:
the page-level redirect stops a browser from reaching the search form,
but not a direct `fetch()` call to that route.

This directly collided with sprint 49's already-shipped public,
non-personalized share page, which lived at these same
`/forecast/[locationId]` URLs with real SEO metadata -- gating that
route would have silently dropped the organic-growth surface the round-2
product decision pulled forward as v1-required. Resolved by moving the
public share page to its own route, `app/share/[locationId]/page.tsx`,
rather than dropping either feature: same `generateMetadata`, same
apps/api call (now shared via `lib/get-forecast.ts` instead of copied),
same visual layout (shared via `app/components/forecast-page-body.tsx`/
`forecast-loading-body.tsx` -- the authenticated and public pages differ
only in their back link and the public one's added sign-up call to
action). `app/page.tsx`'s "Popular spots" links now point at `/share/*`.
`app/robots.ts` gained the real `Disallow` rules its own docstring had
been anticipating since sprint 49 (`/locations`, `/forecast/`,
`/preferences`, `/api/`), keeping `/` and `/share/*` allowed.

`app/login/page.tsx`/`app/register/page.tsx` gained a `?next=`
parameter (`lib/safe-redirect.ts` rejects anything that isn't a real
same-origin relative path, guarding against the classic
`//evil.example.com` protocol-relative open-redirect trick) so a
bounced visitor lands back where they were headed after signing in,
not always `/` -- threaded through the "sign up instead"/"log in
instead" cross-links on each page too, both wrapped in the same
`Suspense` boundary `useSearchParams` already required elsewhere
(`app/reset-password/page.tsx`).

One real thing this caught along the way, worth naming explicitly: a
first pass at verifying this with plain `curl` looked broken -- an
anonymous `curl /forecast/wrightsville-beach-nc` returned a `200` with
the *loading skeleton* as the entire response body, no redirect in
sight. Not a bug: `app/forecast/[locationId]/loading.tsx`'s presence
means that route has a `loading.tsx` Suspense boundary, so once
`page.tsx`'s own `await auth.api.getSession()` takes any non-instant
time, Next commits to a `200` with the loading fallback *before* the
subsequent `redirect()` call runs -- the redirect then has to be
delivered as a streamed RSC instruction inside that same response
(grep the raw bytes for `NEXT_REDIRECT` and it's right there) rather
than a plain top-level `307`, which only a real browser's router
actually executes. Verified for real after that -- a headless Chromium
walkthrough, not `curl`'s HTTP status code -- confirmed the redirect
genuinely fires.

Verified end-to-end against real running `next start`/`uvicorn`/local-
Postgres servers: anonymous visits to `/locations` and
`/forecast/wrightsville-beach-nc` both redirect to
`/login?next=<path>`; registering with `?next=/locations` set lands
back on `/locations`, not `/`; the public `/share/wrightsville-beach-nc`
works with no session at all, shows real forecast content and the
sign-up CTA; while signed in, a real search → select → forecast
walkthrough reaches real rendered content; signing out and revisiting
the forecast page redirects again. `robots.txt` confirmed to carry the
real `Disallow` list. A fresh `axe-core` sweep of the share page,
`/login?next=...`, and `/register?next=...` (light/dark) found 0
violations. `npm run lint`/`build` clean.

**Sprint 36 ("Preferences")** -- the last of the canonical roadmap's six
required `/v1` endpoints (`GET`/`PATCH /v1/me/preferences`), deferred
since sprint 25 for needing both Better Auth and a Postgres-backed
store; both now exist (sprint 28, apps/api's matching `forecast`-schema
work). `lib/internal-api-client.ts` gains an optional `userId` on
`internalApiFetch` -- its own docstring already anticipated this
exact addition back when sprint 28 was still blocked. Threading a real
id through only where it's actually needed (not on every call, e.g.
anonymous location search/forecast lookups stay exactly as they were)
means `X-Internal-User-Id` is only sent when non-empty, so an
unauthenticated call's wire shape is byte-for-byte what it always was.
`app/api/preferences/route.ts` is the BFF proxy (same reason
`app/api/locations/search/route.ts` exists -- the browser never calls
apps/api directly, ADR-004): reads the current session via Better
Auth's own `auth.api.getSession()`, 401s before ever reaching apps/api
if there isn't one. `/preferences` (`app/preferences/page.tsx`) is the
first page in this app that actually requires a session -- checked
server-side via the same `getSession()` call, `redirect('/login')`
before any client code runs for an anonymous visitor. This is
deliberately *not* sprint 29's job (broader account-required routing);
it's this one page needing this one auth check, since it has nothing
useful to show an anonymous visitor regardless of that separate policy
question -- see `app/preferences/page.tsx`'s own doc comment.

`PreferencesForm` (`app/preferences/preferences-form.tsx`) needed one
new pattern the existing primitives didn't have: a units toggle. No
`<select>` primitive exists in the design system yet, and a native
unstyled one would've been the one element on the page not repainted
by a token change -- built a two-button `role="radiogroup"` instead,
reusing `Button`'s color logic by hand. `Field`/`Card`/`Button` covered
everything else with zero changes, the same repeated payoff since
sprint 27. `AuthStatus`'s signed-in name is now a link to `/preferences`
-- desktop-only for now (`hidden sm:inline`, the same breakpoint the
name itself already used): a phone-width entry point risks the exact
header text-wrap crowding sprint 28 already fixed once, and deserves
its own design rather than being squeezed in unreviewed.

Verified end-to-end against real running `next start`/`uvicorn`/local-
Postgres servers: confirmed an anonymous visit to `/preferences`
redirects to `/login`; registered, filled every field (including the
metric/imperial toggle and a real curated `default_location_id`), saved,
reloaded the page, and confirmed every value came back exactly as
saved -- a real Postgres round trip, not client state surviving a
soft navigation. Confirmed an unresolvable `default_location_id` is
rejected with a visible on-page error (apps/api's 422, not silently
accepted). A fresh `axe-core` sweep of the filled-in preferences page,
signed in for real, found 0 violations in both themes. `npm run lint`/
`build` both clean.

Patched two pre-existing `npm audit` findings noticed while adding
sprint 28's dependencies: `next` (critical -- an unauthenticated RCE
advisory, Windows-hosted servers and AVIF image optimization) and its
transitive `sharp` (high, a `libheif` issue), both already present
before this session touched either. `npm audit fix` resolved both with
patch-level bumps already inside the existing `^16.3.1` semver range
(`next` 16.3.1 → 16.3.5, `sharp` 0.35.3 → 0.35.4) -- `package.json`
itself is unchanged, only `package-lock.json`. Re-verified after
bumping: `npm run lint`/`build` clean, and a full re-run of sprint 28's
live auth walkthrough (register → session persists across reload →
sign out → log back in → wrong password rejected) still passes.
`npm audit` now reports 0 vulnerabilities.

**Sprint 28 ("Authentication")** -- previously blocked on "Better Auth +
Postgres infrastructure decisions that don't exist yet" (see the
roadmap's earlier checkpoints). Real local Postgres turned out to be
available in this environment, so the actual blocker was narrower than
it looked: per `docs/architecture.md`'s ADR-005/ADR-006, this only ever
needed *a* PostgreSQL instance, not specifically the not-yet-provisioned
Neon one (sprints 9/10 still own that). Implemented:

- **`lib/auth.ts`** -- Better Auth (`email + password`), backed by a
  real Postgres `auth` schema via Better Auth's own `schemaName`
  option (qualifies every statement itself, not the connection's
  `search_path`) -- a least-privilege `saltline_web` role owns that
  schema alone, matching ADR-006's schema-per-concern split, and has no
  grants on `public` or any future `forecast` schema. `DATABASE_URL` is
  a real local connection string today; moving to the real pooled Neon
  project later is a connection-string change, not a code change.
- **`scripts/migrate-auth-db.mts`** (`npm run migrate:auth`) -- applies
  Better Auth's own migration plan via `better-auth/db/migration`'s
  `getMigrations`, not `@better-auth/cli`: that package's `migrate`
  command pulls its own separately-vendored, older `better-auth`
  (`<=1.6.21`) with several unpatched critical CVEs, all in
  OAuth/OIDC/magic-link/organization-plugin code this app doesn't
  enable (so unreachable in practice) but "no fix available" and a
  dev-only tool either way -- the direct fix was using the same
  function the CLI calls internally, straight from the already-current
  `better-auth` already installed, zero extra dependencies.
- **`lib/email.ts`** -- verification/reset-password email via
  `nodemailer`, reusing CLAUDE.md's exact `SMTP_*` env var convention
  from the retired legacy app rather than inventing a second naming
  scheme. `lib/auth.ts`'s `requireEmailVerification`/`sendOnSignUp` key
  off whether SMTP is actually configured, the same "if unset, accounts
  auto-confirm and no emails are sent" behavior CLAUDE.md documents for
  that legacy app -- an unconfigured `SMTP_HOST` (true in this sandbox)
  never leaves a real signup stuck waiting on a link nothing can send.
- **Rate limiting** -- ADR-005's "separate rate limits" per action,
  via `rateLimit.customRules` for sign-in/sign-up/verification-resend/
  password-reset. Verified live, not just configured: a clean-state run
  of 7 rapid `/sign-in/email` requests allowed exactly 5 (the configured
  `max`) before the 6th returned 429 -- confirms the custom rule is
  actually overriding Better Auth's own stricter built-in default
  (`max: 3`) for that path, not silently falling through to it.
- **UI** -- `/register`, `/login`, `/forgot-password`, `/reset-password`
  pages (Field/Card/Button primitives, zero new styling needed, the same
  payoff sprint 27's rebrand already proved out) and `AuthStatus`
  (`app/components/auth-status.tsx`), the one session-dependent piece of
  the otherwise server-rendered `SiteHeader`, isolated into its own
  Client Component. Adding it to the header crowded "Find your spot" +
  "Log in"/"Sign up" (or "Sign out") onto one row at phone width and
  exposed a real pre-existing wrap bug (link text wrapping mid-word) --
  fixed with `whitespace-nowrap` on each link/button, not previously
  needed when the header held only one link.
- **CSRF, secure/HttpOnly cookies, session rotation** -- all Better
  Auth defaults, satisfying that part of ADR-005 with no extra config.

**Deliberately not attempted** (see `docs/CANONICAL_ROADMAP.md`'s
sprint 28/44 rows): bot/CAPTCHA defense on registration needs a real
third-party provider (Cloudflare Turnstile or hCaptcha) and a site
key/secret this session has no credentials for -- flagged the same way
sprints 9/10's Vercel/Render/Neon credentials were flagged, not guessed
at. Account-required routing (sprint 29), onboarding (sprint 30), and
wiring a real signed-in user ID into `lib/internal-api-client.ts`'s
calls to apps/api (that file's own docstring already anticipated this
sprint) stay separate sprints' jobs -- nothing here gates any existing
page behind a session.

Verified end-to-end against real running `next start`/local-Postgres
servers, not mocks: registered a real account, confirmed the header
flips to "Sign out" immediately and stays that way across a full page
reload (real session cookie, not client state), signed out, logged back
in with the same credentials, and confirmed a wrong password is
rejected with a real 401 and an on-page error -- a full round trip, not
one half of it. A fresh `axe-core` sweep across all four new pages x 2
themes found 0 violations. `npm run lint`/`npm run build` both clean
(`BETTER_AUTH_SECRET` needs a placeholder value for `build` specifically
-- see "Local dev" below and the `advanced.database.validateSchema` note
in `lib/auth.ts` for why an unset `DATABASE_URL` is fine for `build` but
an unset `BETTER_AUTH_SECRET` still logs noise).

Ran the actual local-dev prototype end-to-end for the first time this
session -- real `uvicorn`/`next start` servers, signed internal requests,
a real browser walking home → search → select → forecast, not mocks or
a code read. Caught one more real bug doing it: `ForecastCard`'s
"Confidence" field rendered `forecast.confidence.level` raw --
apps/api's `ConfidenceLevel` enum serializes lowercase (`"low"`), so it
showed as `low` sitting right next to the properly-capitalized `Partial`
`State` badge in the same row. Fixed with the same `capitalize()`
helper already used for `State`/`Badge` labels elsewhere in this file.
Confirmed live (`Confidence: Low`, capitalized, matching `State:
Partial`) and with a fresh `axe-core` sweep against the real running
forecast page, 0 violations both themes. `npm run lint`/`npm run build`
clean.

`LocationSearch` loading state and a real race-condition fix:
the debounced search gave zero feedback for the gap between typing and
a response landing -- the dropdown just silently appeared once data
arrived, with nothing shown for the request itself. Now opens as soon
as the debounced request actually starts, showing a "Searching…" row
(the same non-selectable-option-row technique already used for "no
matches", plus `aria-busy` on the combobox itself for an earlier
screen-reader signal). While doing this, found and fixed a real
pre-existing race: a query edited faster than the debounce plus one
round trip could leave an earlier request in flight when a newer one
starts, and a slow, now-stale response landing after the fact would
silently repopulate the dropdown with results for a query the field no
longer shows. Fixed with a per-request `AbortController`, cancelling
the previous request whenever a new one starts.

Verified against a real running server with Playwright network
interception (not just reading the code): delayed the search API
response to actually observe the "Searching…" state mid-flight
(screenshotted, `axe-core` 0 violations, light/dark), and reproduced
the race directly -- two real requests ("co" delayed 2s, "cocoa" fast),
confirmed the stale "co" response does *not* clobber the later "cocoa"
results once it eventually lands. `npm run lint`/`npm run build` both
clean.

Fixed a real bug in `ForecastCard`'s "Generated" field: every other
timestamp in the card (tides, hourly outlook, the best-window callout)
is formatted via `Intl.DateTimeFormat` in the location's own timezone --
"Generated" was the one left rendering `forecast.generated_at` raw, an
unformatted ISO datetime string straight from apps/api's JSON (e.g.
`2026-09-17T15:27:03.412Z` instead of "Wed 11:27 AM"). Fixed with the
same formatter pattern already used everywhere else in this component.
Verified with a temporary preview page (same throwaway technique used
elsewhere in this README) rendering a real mock forecast --
screenshotted and confirmed the field reads correctly, `axe-core` 0
violations in both themes -- deleted before commit; `npm run build`'s
route table unaffected.

`color-scheme` metadata: `app/layout.tsx`'s `viewport` export only ever
declared `themeColor` (the browser chrome/address-bar color), not
`colorScheme` -- without it, the browser renders *native* UI (scrollbars,
`<select>`/form-control chrome) in its light-only default even while the
page itself is in `globals.css`'s dark-mode palette, a real visible clash
(a light scrollbar on an otherwise dark page) this rebrand hadn't caught
yet. Added `colorScheme: 'light dark'`, which resolves to
`<meta name="color-scheme" content="light dark">` -- confirmed against a
real production server's actual `<head>` output, alongside the two
`theme-color` tags already there.

Installability metadata -- `app/manifest.ts` (name "Saltline", theme/
background colors, `display: 'standalone'`) plus the icon sizes a real
"Add to Home Screen" needs that `app/icon.tsx`'s single 32x32 favicon
never covered: `app/icon-192/route.tsx` and `app/icon-512/route.tsx`
(plain Route Handlers, not the special `icon` file convention -- a
manifest needs stable src URLs per size, `dynamic = 'force-static'` so
they're prerendered once rather than regenerated per request) and
`app/apple-icon.tsx` (iOS's 180x180 touch icon, deliberately *not*
pre-rounded like `icon.tsx`'s favicon tile -- iOS masks the corners of
whatever square source it's given, so a source that's already rounded
gets double-rounded in practice). `app/layout.tsx` also gained
`appleWebApp` metadata (`mobile-web-app-capable`/`apple-mobile-web-app-
title`/`-status-bar-style` meta tags) since Safari only started reading
a manifest's own `display: 'standalone'` in iOS 16.4 -- older iOS still
needs these to open without Safari's chrome. All three new image routes
hand-copy the same logomark/tile markup `icon.tsx` and
`opengraph-image.tsx` already do, for the reason their own doc comments
give: Satori (`next/og`'s renderer) doesn't resolve Tailwind's
`currentColor`-based classes, so `app/components/brand-mark.tsx` isn't
reusable here.

This is deliberately just installability metadata, not a claim on
sprint 38 ("PWA baseline") -- that row's real bar is full offline
app-shell navigation via a service worker, untouched here.

Verified against a real production build/server: `curl`-fetched
`/manifest.webmanifest` (real JSON, correct icon URLs/sizes/types),
checked the actual `<head>` output for `<link rel="manifest">`,
`<link rel="apple-touch-icon">`, and all three `appleWebApp` meta tags,
confirmed `/icon-192`/`/icon-512`/`/apple-icon` serve real
`image/png` responses, and screenshotted all three -- correct tile
color, proportions, and (for `apple-icon`) the expected unrounded
square. `npm run build`'s route table shows all three as static
(`○`), not per-request (`ƒ`). `npm run lint`/`npm run build` both
clean, no new warnings beyond the same `only-export-components` pattern
`icon.tsx`/`opengraph-image.tsx` already carry (an image-generation
file exporting non-component config alongside its default export).

Branded forecast loading skeleton: `app/forecast/[locationId]/page.tsx`
is `force-dynamic` (forecasts are live, per-request data) and its fetch
can take real seconds against live upstreams -- without a `loading.tsx`,
the App Router shows a blank page for that whole wait, the remaining
built-in Next surface the rebrand hadn't reached after the error
boundaries above. `app/forecast/[locationId]/loading.tsx` mirrors the
real page's own two-part shape (the `.ph-photo` hero band, then a `Card`
in a `Container`) at matching block heights and structure -- badge,
best-window callout, sunken conditions panel, the state/confidence/
generated grid, source list -- so swapping in the real forecast doesn't
jump the layout, the same zero-CLS bar sprint 39 measured everywhere
else. `role="status"` plus sr-only "Loading forecast…" text is the real
accessibility signal; every pulsing block is `aria-hidden`, decorative
only. Verified with the same technique as the error boundaries above: a
temporary `app/preview-loading/page.tsx` rendering the skeleton directly
(loading.tsx only activates behind a genuinely slow fetch, which this
sandbox's blocked network can't produce on demand) for a real screenshot
and `axe-core` sweep in both themes (0 violations), deleted before
committing -- confirmed via `git status` and a fresh `npm run build`'s
unaffected route table.

Branded error boundaries, continuing the Saltline rebrand into the app's
remaining unbranded built-in surfaces: sprint 27's rebrand gave
`app/not-found.tsx` a real 404 (see `app/components/site-header.tsx`'s
own doc comment for the persistent-header pass that came after it), but
any *unexpected* render/runtime error still fell through to Next's
default unstyled overlay -- the one other App Router file convention the
rebrand hadn't reached. `app/error.tsx` (a route-segment boundary,
renders inside the root layout so the persistent `SiteHeader` still
shows) and `app/global-error.tsx` (the last-resort boundary for a crash
in the root layout itself, which replaces the whole document per the App
Router contract, so it owns its own `<html>`/`<body>` and imports
`globals.css` directly rather than relying on the layout it's
standing in for) both share `not-found.tsx`'s layout -- `BrandMark`,
centered copy, a primary action -- with a "Try again" button
(`reset()`) alongside "Back home", instead of 404's single link, since
a transient error is often recoverable without leaving the page.

Verified against a real production build/server: a temporary
`app/test-error/page.tsx` (`force-dynamic`, throws unconditionally --
the same throwaway-mock-preview technique used for sprints 32/33/34's
preview pages) triggered `error.tsx` for a real screenshot and
`axe-core` sweep in both light and dark mode (0 violations), then was
deleted before committing -- `git status` confirmed no trace, and a
fresh `npm run build` confirmed the real route table is unaffected.
`global-error.tsx` only fires when the root layout itself throws, which
isn't reachable through the app's own pages without deliberately
breaking `layout.tsx`; not attempted here since doing so wouldn't leave
anything real to verify against once reverted, but it shares its
implementation with the already-verified `error.tsx`, using the same
`BrandMark`/`Button`/`Container` primitives that repainted correctly
without changes throughout the sprint 27 rebrand. `npm run lint`/
`npm run build` both pass clean, no new warnings.

Sprint 27 ("Design system"), the branding decision: the app is now
**Saltline** -- a full visual rebrand in a Surfline-style bright/coastal
direction, replacing the "Surf & Pier Forecast" placeholder identity.
A concept canvas (name options, palette, type, key-screen mockups) was
reviewed with the product owner before any code changed.

`app/globals.css`'s `@theme` tokens carry a new oklch-based coastal
palette (light and dark defined separately per token, semantic
go/marginal/no-go tokens re-tuned per theme rather than inverted) and a
Space Grotesk (headlines) / Public Sans (body) type pairing, loaded via
a `<link rel="stylesheet">` in `app/layout.tsx` -- deliberately not
`next/font/google`, which fetches font files at *build* time and fails
under restricted outbound network (this sandbox included); a `<link>`
loads client-side instead and behaves identically once deployed.
`next.config.ts`'s CSP gained one deliberate external allowance
(`style-src`/`font-src` for Google's two font hosts) for this, its only
exception otherwise being self-only.

`app/components/ui/`'s primitives needed **zero code changes** -- every
real page repaints correctly from the token change alone, the payoff
of sprint 27's original "real accessible primitives" architecture.
`app/page.tsx` is now a real landing page (hero, value props, links to
real curated locations, no fabricated verdict badges on them); the
former component gallery moved to `/design-system`. `app/icon.tsx` and
`app/opengraph-image.tsx` carry the new logomark: a horizon line, a
sunrise arc, and a wave -- the line where tide meets shore. Real
photography doesn't exist yet, so hero art is an explicit, clearly
labeled placeholder pattern (`.ph-photo`/`.ph-photo-label` in
`globals.css`) naming the real shot needed, never an AI-generated
stand-in.

Caught and fixed one real bug: `--color-primary` serves both as a
button background (with white text) and as bare text directly on the
page background (`Button`'s "secondary" variant, eyebrow labels) -- the
initial brighter teal cleared AA contrast for the first role but failed
the second at 3.6-3.8:1, caught by a real `axe-core` sweep. Fixed by
computing actual WCAG contrast ratios (canvas-rendered oklch resolved
to real sRGB, not estimated) and choosing a lightness clearing 4.5:1 in
both roles at once. Verified against two real running servers: a full
`axe-core` sweep (5 pages x 2 viewports x 2 themes, 0 violations), the
existing combobox interactive-state checks re-run under the new palette
(0 violations), and a clean `npm run build` (`/design-system` added,
nothing leaked).

**Follow-up layout pass**: the rebrand above only re-themed the existing
page layouts (new colors/fonts on the same structure). A second pass
actually reworked the forecast and search pages' composition to match
the reviewed concept canvas, not just recolor them:

- The forecast page (`app/forecast/[locationId]/page.tsx`) gained a
  real photo-hero band (`.ph-photo`) above `ForecastCard`, with a
  back-to-search link and the location name overlaid, replacing the
  old plain-text `<h1>` header.
- `BestWindowCallout` (`forecast-card.tsx`) became a distinct
  coral-tinted callout card (`--color-accent-tint`, new this pass) with
  a clock icon, instead of a plain text line.
- The conditions-summary/score-details block gained a `bg-bg`
  sunken-panel treatment inside the card, visually separating it from
  the rest without a second border.
- `LocationSearch`'s dropdown gained row dividers, a softer
  selected-row highlight (`--color-primary-tint`, new this pass)
  instead of a solid fill, and a checkmark on the active option.

Caught a second real contrast bug immediately, same method as before:
the new callout's "Best window" label at `text-accent` on
`bg-accent-tint` measured 2.49:1 in light mode -- badly failing AA.
Fixed by using `text-text-muted` instead, matching the color other
eyebrow-style labels in the same component already use. Re-verified
with the same full `axe-core` sweep, the interactive combobox states,
a keyboard-only walkthrough, and tap-target checks -- 0 violations, no
regressions. Real photography and i18n string externalization remain
open.

Sprint 33 ("Conditions experience"), closing out the sprint whose
`SourceStatusList`/`state`-badge implementation was already built (see
the sprint-33 paragraph further down): this sandbox's network egress is
blocked, so the real forecast page's live path has only ever produced
`ForecastEnvelope.state` values of `partial`/`unavailable` -- `fresh`,
`stale`, and a multi-source `degraded` fan-out had never actually been
rendered or `axe-core`-checked, only asserted to work from reading the
code. Closed with a temporary `apps/web/app/preview-sprint33/page.tsx`
(the same throwaway-mock-preview technique already used for sprint 32's
dashboard hierarchy and sprint 34's tide chart) rendering `ForecastCard`
four times with hand-built `ForecastEnvelope` mocks for all four states
-- screenshotted in light/dark (confirmed visually: correct badge colors
and copy per state, provider errors shown only for non-ok sources,
`warnings` rendered only when present) and `axe-core`-checked in both
themes, zero violations. Deleted before commit -- `git status` confirmed
no trace, and a fresh `npm run build` confirmed the real route table is
unaffected. No bugs found this time; no code changes needed.

Sprint 39 ("Responsive polish"), the three items left open after an
earlier Lighthouse pass already covered the "assets"/"Lighthouse"
sub-items (see below). All three verified clean against real running
servers with no code changes needed:

- **Layout shift**: real Cumulative Layout Shift measured via the
  browser's own Layout Instability API (`PerformanceObserver`, the same
  signal Lighthouse itself reads) across every page x 2 viewports, on
  initial load and through `LocationSearch`'s open/select interaction --
  `0.0000` everywhere, since the dropdown's `position: absolute` popup
  never reflows surrounding content.
- **Tap targets**: axe-core's `target-size` rule is tagged `wcag22aa`
  but ships *disabled by default* -- sprint 40's tag-based sweep
  (`runOnly: {type: 'tag', ...}`) silently skipped it despite the tag
  match, caught only by inspecting the rule's own `enabled` flag in
  `axe.min.js` directly. Ran it explicitly enabled across every page x 2
  viewports -- 0 violations -- cross-checked independently with a manual
  Playwright `boundingBox()` measurement of every real interactive
  element against the WCAG 2.5.8 24x24 CSS px minimum -- 0 undersized.
- **Screenshot budgets**: this ledger phrase has no prior definition
  anywhere in the repo. Interpreted conservatively and documented as
  such: a literal full-page-PNG byte-size ceiling (1.5MB) per page x
  viewport, explicitly *not* a full visual-regression CI system --
  choosing a tool and a baseline-image storage/review workflow is a
  bigger process decision, flagged as open rather than made here. All
  pages measured well within budget (29KB-274KB).

Sprint 40 ("Accessibility pass"), ledger acceptance "WCAG 2.2 AA, axe plus
keyboard/screen-reader evidence." Scope actually run against real servers,
not just static markup: (1) a full `axe-core` sweep (`wcag2a`/`wcag2aa`/
`wcag22aa` tags) across every real page in 2 viewports (desktop/phone) x
2 color schemes -- 20 combinations, 0 violations; (2) the same sweep
against `LocationSearch`'s interactive states specifically (dropdown open
with results, dropdown open with zero matches), since the earlier static
sweep only ever loaded pages at rest; (3) a scripted keyboard-only
walkthrough (Tab to the combobox, type a query, Arrow through results,
Escape, re-open, Enter to select, Tab away) checking focus order, visible
focus rings, and no keyboard trap; (4) Playwright's
`page.accessibility.snapshot()` as an **automated proxy for
screen-reader-consumable structure** -- confirming real names/roles reach
the platform accessibility tree the way a screen reader would read them,
explicitly *not* a claim of testing with actual screen-reader software,
which this environment cannot run.

Step (2) caught a real bug: `LocationSearch`'s `<input role="combobox">`
pointed `aria-controls` at the listbox's id unconditionally, but the
listbox `<div>` was only ever rendered when there were results to show
-- axe's `aria-valid-attr-value` flagged the dangling reference whenever
the dropdown was open with zero matches. The first fix (only setting
`aria-controls` when the listbox was rendered) traded that violation for
`aria-required-attr` instead, since ARIA's combobox role requires
`aria-controls` to be present unconditionally. The actual fix: the
listbox `<div id role="listbox">` is now always rendered (so
`aria-controls` always resolves), with visibility toggled via the native
`hidden` attribute -- the convention the ARIA APG combobox pattern itself
uses, and one that also excludes the empty/idle listbox from axe's checks
so an option-less `role="listbox"` never gets flagged by
`aria-required-children`. The "no matches" state renders a single
non-selectable `role="option"` (`aria-disabled`) row inside the listbox
rather than a sibling `<p>`, for the same required-owned-elements reason.

Step (1)'s sweep also caught a real WCAG 1.4.10 (Reflow) bug axe-core
can't detect automatically: `ForecastErrorCard`'s troubleshooting
paragraph named `INTERNAL_SIGNING_KEY_SECRET` in an inline `<code>` --
one long unbreakable token -- which pushed real horizontal overflow past
a 390px mobile viewport. Fixed with the same `break-words` class already
used one line above it in that component.

Step (3)'s walkthrough caught a second real bug, unrelated to ARIA
attributes: selecting a result sets `query` to the result's full name to
fill the field, and since that name still meets `MIN_QUERY_LENGTH`, it
re-triggered the same debounced search effect and reopened the dropdown
~300ms after a keyboard selection (`aria-expanded` flipping back to
`true` on its own, with no user action). Fixed with a ref flag that skips
exactly one search-effect run when the query change came from
`selectResult` rather than an edit.

Sprint 49 ("SEO and sharing"), the "public non-personal forecast pages
(organic-growth surface)" half of the acceptance bar: `app/forecast/
[locationId]/page.tsx` gains a real `generateMetadata` -- per-location
title (`"{label} Fishing Forecast"`), description, canonical URL, and
OpenGraph tags, replacing the root layout's generic default on the one
page type worth indexing individually. The description is deliberately
static copy about the location, never live score/warning text — a
degraded-conditions sentence (a real "could not connect to..." warning)
has no business being cached into a search result or link-preview
card. The actual `internalApiFetch` call was wrapped in React's
`cache()`, intended to make `generateMetadata` and the page body share
one real network round trip per request instead of two (`fetch`'s own
automatic per-request memoization can't help here regardless — ADR-004
signs every request with a fresh `requestId`/timestamp, so two calls
for the same location never look like the same `fetch(...)` call to
that mechanism). **Correction, found once sprint 41's request tracing
existed to check it**: `cache()` does not actually dedupe this in
apps/web's Next.js/Turbopack setup — a real two-server trace (grepping
one `request_id` across both services' logs) showed two distinct
signed calls reaching apps/api per page view, not one. See
`app/forecast/[locationId]/page.tsx`'s `getForecast` docstring for the
full account; `apps/api`'s own sprint-24 `SnapshotCache` keeps the
real-world cost of the second call low (single-digit milliseconds)
regardless, so this is a known, measured inefficiency, not a
correctness problem. A 404 (unknown `location_id`) calls `notFound()`
from `generateMetadata` too, matching the page body, so a bad link
gets Next's real not-found metadata instead of a fabricated title.

`app/layout.tsx` gains `metadataBase` (env-driven via
`NEXT_PUBLIC_SITE_URL`, defaulting to `http://localhost:3000` so
`next build`/`next dev` never need it set), a title template
(`"%s — Surf & Pier Forecast"`), and `openGraph`/`twitter` defaults.
`app/opengraph-image.tsx` generates a real 1200×630 PNG link-preview
card at build time via `next/og`'s `ImageResponse` (same technique as
`app/icon.tsx`'s favicon — no `public/` asset), using the design
system's own teal/coral palette, so this implies no branding decision
beyond the one already on record (sprint 27's row); a per-location
card is a follow-up, not attempted here. `app/robots.ts` allows every
page (nothing is private yet — sprint 28's job) and deliberately omits
a `Sitemap` directive: a real sitemap needs an endpoint that can
enumerate every curated location, and `apps/api`'s 101-spot dataset
isn't exposed that way today (only via `/v1/locations/search`'s
query-based lookup) — inventing a partial sitemap from whatever
happens to be searchable would misrepresent the site's real page count
more than omitting it entirely; that's this sprint's remaining open
piece, needing a small `apps/api` addition first.

Verified against two real running servers: `curl` confirmed the real
per-location `<title>`/description/canonical/`og:*` tags, the 404
page's fallback to the generic title, `robots.txt`'s real output, and
the OG image's real `image/png` response (`file` confirmed 1200×630).
A fresh `axe-core` spot-check on the forecast and home pages found
zero violations. `npm run build`'s route table gained `/robots.txt`
and `/opengraph-image` as new static routes; `/forecast/[locationId]`
is still `ƒ Dynamic`. `npm run lint`/`npm run build` both pass clean.

Sprint 34's last remaining open piece, the tide visual chart:
`ForecastCard` gains `TideChart`, rendered alongside (not instead of)
the already-complete `TideTable`. This is a **point chart with
straight lines between real predictions, not an interpolated curve**:
NOAA CO-OPS's `hilo` predictions product
(`app.providers.noaa_coops.fetch_tide_predictions`) gives real
predicted heights only at each high/low extremum, not a continuous
hourly series, so drawing a smooth cosine-shaped curve between them
would be *inventing* the in-between shape rather than showing real
predicted values — the same Integrity discipline this recovery already
enforces server-side (e.g. `is_fallback` labeling) applied to a
frontend chart choice. A small point count (typically 4-6 across the
2-day fetch window) means every point gets its own direct height
label, unlike the 24-bar hourly chart's sparser labeling — `dataviz`'s
"label selectively" guidance explicitly allows labeling every point
when there are only a handful. Single-hue on `--color-primary` (a
magnitude series, not identity — same reasoning as
`HourlyOutlookChart`), `aria-hidden="true"`, no `tabindex` inside it.
The x-axis is real elapsed time between the first and last prediction
(not evenly-spaced-by-index), since predictions can span more than one
day unevenly. Caught and fixed one real rendering bug in the process:
the first/last point's centered height label was clipped by the
`viewBox` edge with zero horizontal padding — added
`_TIDE_CHART_SIDE_PADDING` and confirmed both edge labels fully
visible in a re-screenshot. Since `tides` is always `null` on this
sandbox's live path (blocked upstream calls), verified against a
temporary mock preview page (six realistic alternating high/low
predictions; screenshotted in both color schemes at desktop and phone
widths, then deleted before committing) plus a fresh `axe-core`
spot-check — zero violations, no overflow. This closes sprint 34's
acceptance bar entirely.

Sprint 34's earlier "accessible charts" sub-item: `ForecastCard` gains
`HourlyOutlookChart`, a hand-rolled SVG bar chart rendered
alongside (not instead of) the already-complete `HourlyOutlookTable`.
Per the `dataviz` skill's own form heuristic, one activity level per
hour is a **magnitude** series, not a categorical identity, so it gets
a single-hue sequential encoding — `--color-primary` at variable
opacity, bar height *and* opacity both tracking `level` — rather than
four discrete colors for `ActivityTag`'s low/med/high/prime tiers.
`--color-go-text`/`--color-marginal-text` (used elsewhere, but only
*paired* with their own light-tint badge background) were considered
and rejected for a bar fill: per `app/globals.css`'s own comment on
`--color-danger-text`, those tokens are theme-invariant and would risk
the exact dark-mode contrast bug the sprint-27 `axe-core` pass already
found and fixed once for `--color-nogo-text` — `--color-primary`/
`--color-accent` are already theme-aware, sidestepping that risk
entirely instead of adding new tokens to re-solve it. The current hour
gets an accent-colored ring; the day's peak gets an accent dot. The
whole chart is `aria-hidden="true"` — it's a decorative duplicate of
data the table already carries as real, screen-reader-reachable text,
so re-announcing it would be noise, not a service; per that same rule,
each bar has a native SVG `<title>` (mouse-hover tooltip) but no
`tabindex`, since an `aria-hidden` subtree must never contain a
keyboard-focusable element (axe-core's `aria-hidden-focus` rule).
Since `hourly_outlook` never degrades to `None` (unlike `tides`), this
was verified against the real, live forecast page rather than mock
data — the chart's bar heights visibly match the adjacent table's
levels — plus a fresh `axe-core` spot-check across desktop/phone ×
light/dark (4 combinations) found zero violations and no horizontal
overflow. A visual chart for tides remains open, and is a separate,
smaller follow-up (a curve/point chart, not a bar chart, since the
`dataviz` skill's own form heuristic treats a small handful of
high/low events differently from a fine-grained hourly series).

Sprint 39 ("Responsive polish"), the "Lighthouse" acceptance sub-item:
ran a real [Lighthouse](https://developer.chrome.com/docs/lighthouse/)
audit (mobile, performance/accessibility/best-practices/SEO) against a
real production build (`next build && next start`, not `next dev`) for
`/`, `/locations`, and `/forecast/wrightsville-beach-nc` — the first
time this repo has run Lighthouse rather than just `axe-core`, which
only covers the accessibility category. Accessibility, best-practices,
and SEO all scored a clean 100 on every page; performance scored
96-98. One genuine finding, fixed: no `favicon`/`icon` file existed
anywhere in `apps/web`, so every page load made a real browser request
`GET /favicon.ico` that 404'd — a real console error, not a cosmetic
gap (Lighthouse's `errors-in-console` audit failed outright, 0/1, on
the pages tested). `app/icon.tsx` generates a real 32×32 PNG at build
time via `next/og`'s `ImageResponse` (a statically-optimized route, no
`public/` image asset needed) — a small teal/coral wave glyph using
`app/globals.css`'s own design-system palette, not an arbitrary color
choice, so this doesn't imply a branding decision beyond the one
already on record (sprint 27's row). Confirmed fixed: `best-practices`
went from 96 to 100 on the forecast page after adding it, and
`curl`/`file` confirmed a real `image/png` response. The remaining
performance-category audits (`total-blocking-time`,
`max-potential-fid`, `unused-javascript` — the last one flagging ~55
KiB of unused bytes inside Next.js/React's own framework chunks, not
identifiable app code) are recorded as a real baseline, not chased:
this sandbox's shared, unaccelerated CPU makes absolute timing numbers
noisy run-to-run (the same forecast page scored both 94 and 98 across
two runs), the same caveat sprint 26's performance-budget test already
documented for cold-path latency — further bundle-splitting work would
be premature before Phase 3 itself is complete. Screenshot-budget and
tap-target sub-items are not attempted here.

Sprint 44's remaining "security hardening" piece, CSP and security
headers: `next.config.ts`'s `headers()` attaches `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, `X-Permitted-Cross-Domain-Policies`, and
`Strict-Transport-Security` to every response, plus `poweredByHeader:
false` to drop `X-Powered-By: Next.js`. Adapted from the legacy Flask
app's `_set_security_headers` (`app.py`), not ported verbatim: apps/web
has no third-party scripts, external fonts, or non-`self` image origins
today, so the CSP is deliberately stricter — self-only on every
directive, nothing external to allow-list. `'unsafe-inline'` on
`script-src`/`style-src` is still required without a nonce (Next.js
inlines its hydration payload); nonce-based CSP would force *every*
page to render dynamically (per `node_modules/next/dist/docs/01-app/
02-guides/content-security-policy.md`'s "Without Nonces" section — this
repo's Next version renamed the nonce-generating file from
`middleware.ts` to `proxy.ts`, one of the breaking changes
`apps/web/AGENTS.md` warns to check docs for before assuming
training-data APIs still apply), a real cost not worth paying yet for
pages with no user data. `Permissions-Policy` locks geolocation/camera
fully closed, unlike the legacy app's `self`-scoped allowance for its
device-geolocation/catch-log-photo features — neither exists in
apps/web yet; sprint 31's still-open device-geolocation sub-item is the
right point to loosen it, not before. Verified against a real
production build (`next build && next start`, not just `next dev`):
`curl -D -` confirmed every header present and correctly formed on a
static page (`/`), a dynamic page (`/forecast/{id}`), and a Route
Handler (`/api/locations/search`); a headless-Chromium pass exercised
the full search → select → navigate interactive flow end-to-end and
confirmed **zero actual CSP violations** in the console (the initial
run's "404 Failed to load resource" console noise turned out to be
Next.js's own `Link` prefetch (`?_rsc=...`) 404ing and aborting when a
real navigation supersedes it — normal Next.js behavior, reproduced
identically without this PR's changes, not a CSP-caused regression); a
fresh `axe-core` spot-check across home/locations/forecast/404 found
zero violations. `npm run build`'s route table is unchanged (`headers()`
doesn't force static pages into dynamic rendering) and `npm run lint`
is clean.

Still no auth — but `apps/web` can now call `apps/api` through ADR-004's
signed internal request path
([`docs/architecture.md`](../../docs/architecture.md)):
`lib/internal-signature.ts` is a TypeScript mirror of `apps/api/app/
infra/internal_signature.py`'s canonical-string + HMAC-SHA-256
primitive (same field order, same algorithm — that's the entire
contract), and `lib/internal-api-client.ts`'s `internalApiFetch` signs
and sends requests with it, failing closed (throws) if the signing-key
env vars aren't set rather than silently calling unsigned.
`app/forecast/[locationId]/page.tsx` is a Server Component proving this
end-to-end: it calls apps/api's real `GET /v1/forecasts/{id}` for
*any* recognized `location_id` and renders whatever comes back,
including a gracefully degraded response, using the sprint 27
primitives (`app/components/forecast-card.tsx`). A 404 from apps/api
(unknown location) becomes this page's own not-found state via
`notFound()`. It's marked `export const dynamic = 'force-dynamic'`
since forecasts are live, per-request data — without that, `next
build`'s static prerender pass would freeze whatever the fetch did at
build time (when apps/api isn't running) into the shell served to every
visitor. This is a signed-path proof, not the real dashboard (sprint
32) — its verdict-badge mapping is page-scoped presentation only.
`app/forecast/demo/page.tsx` (the earlier fixed-location proof, only
ever Wrightsville Beach) now just redirects to
`/forecast/wrightsville-beach-nc`, kept in case anything still links to
it rather than deleted outright.

Sprint 33 ("full/partial/stale/unavailable source-attributed
snapshots"): `ForecastCard` now renders `forecast.state` as a Badge
(fresh/stale/partial/unavailable, apps/api's own vocabulary, not
reinterpreted) instead of plain text, and a new `SourceStatusList`
shows every individual source apps/api fanned out to (marine zone,
water temperature, buoy, tides, and the wind-fallback chain when it
fires) with a human-readable label, an ok/degraded/unavailable badge,
and the raw provider error as its own line for non-ok sources — real
per-source attribution, not just the aggregate state/warnings already
shown. Verified against a real running server (every source correctly
`unavailable` in this sandbox, exactly as designed) and re-audited with
`axe-core` (zero violations). Caught one more real bug in the process:
detail/warning message text (which can contain long provider URLs)
overflowed the viewport at phone width instead of wrapping —
`break-words` on those three text nodes fixed it, confirmed by
re-screenshotting at 390px.

Sprint 34's frontend half (the accessible-chart/text-alternative
rendering `apps/api`'s backend half — merged earlier — deliberately
left to `apps/web`): `app/components/forecast-card.tsx`'s
`ForecastCard` now renders a `TideTable` when `forecast.tides` is
present — a plain, properly-labeled `<table>` (`<caption>`,
`scope="col"` headers) rather than a visual chart, which is itself an
accessible representation, not a fallback for one. Times are formatted
in the *location's* timezone (`Intl.DateTimeFormat` with
`forecast.location.timezone`), not the viewer's browser timezone — a
tide time is only meaningful relative to the place it's for. Since
this sandbox's blocked upstream calls mean `tides` is always `null`
here (verified — the `noaa_coops:tides` source correctly degrades),
the table itself was visually verified against realistic mock data via
a temporary preview page (screenshotted in light/dark, then deleted
before committing) rather than the live path, which only proves the
`null` case.

Sprint 34's remaining "timing" scope, frontend half: `ForecastCard`
now also renders an `HourlyOutlookTable` when `forecast.hourly_outlook`
is present — `apps/api`'s new `app.domain.timing.build_hourly_outlook`
24-hour fish-activity estimate (backend), shown the same way as
`TideTable`: a plain `<table>` with the current hour highlighted, an
`Activity` `Badge` (prime/high → go, med → marginal, low → neutral, so
a quiet overnight hour never reads as a failure state), and a `Why`
column showing apps/api's own plain-language reasons (`"Dawn · Minor
solunar"`, `"Major solunar"`, ...) verbatim rather than re-derived
here. Unlike `tides`, `hourly_outlook` never degrades to `null`
(astronomy always resolves), so — unlike `TideTable` — this was
verified against the real, live `/forecast/wrightsville-beach-nc` page
rather than mock data: real dawn/dusk/solunar reasoning rendered
correctly (hour 6 tagged `Prime · Peak`, `Dawn · Minor solunar`), and a
fresh `axe-core` spot-check across desktop/phone × light/dark (4
combinations) found zero violations and no horizontal overflow at
390px.

Sprint 32 (partial — hierarchy restructuring on the existing
single-location forecast page, not the multi-location dashboard):
`ForecastCard` is reordered to match the sprint's acceptance bar —
"go/no-go as a simple traffic-light headline (score/narrative
expandable, not primary); best window, conditions, confidence,
freshness first." The verdict `Badge` is now enlarged and first, a new
`deriveBestWindow` pure function derives a "best window" callout
straight from `forecast.hourly_outlook` (the longest contiguous run of
the day's best activity tag — no new fetch, sprint 34's own module
docstring flagged this as derivable), and the numeric score plus its
narrative move into a native `<details>`/`<summary>` — present, but
demoted, not the first thing a reader sees. Confidence/state/freshness
stay in the summary strip right below (a wind/wave/water-temperature
"conditions" mini-panel, the sprint's other named element, followed in
a later PR — see below). Since this sandbox's blocked upstream calls
mean the verdict is always `Unknown` (empty score/summary) on the live
path, the enlarged traffic-light badge and the expandable
score-details interaction were verified against a temporary mock
preview page (a `Good`/82 verdict with a real best-window block;
screenshotted collapsed and — via a real Playwright click on the
`<summary>` — expanded, in both color schemes, then deleted before
committing) rather than the live path, which only exercises the
`Unknown`/no-summary case; a fresh `axe-core` spot-check on both the
live page and the mock preview found zero violations and no
horizontal overflow at 390px.

Sprint 32, continued (the "conditions" mini-panel deferred above): a
new `ConditionsSummary` renders right after the "best window" callout,
matching the acceptance bar's literal ordering ("best window,
conditions, confidence, freshness"). It shows a single "Wind 10–15 kt
SW · Waves 2–3 ft · Water 76°F" line from `apps/api`'s new
`ForecastConditions.wind_range_kt`/`wave_range_ft`/`wind_direction`
fields (added in the same change, `app/domain/assembly.py`) — the
exact already-reconciled numbers `score_conditions` was computed from
— rather than re-deriving that NWS-marine-zone-over-NDBC-buoy
source-preference policy from the raw per-source fields on the
frontend a second time, which would risk drifting from
`app.domain.assembly`'s own `_reconcile_range`. Water temperature
(always present, unlike wind/wave) is labeled `(monthly avg)` when
`is_fallback` is set, same honesty rule as everywhere else this app
shows a fallback value. Since this sandbox always has both ranges
`null` on the live path, the populated case was verified the same way
as the traffic-light headline above: a temporary mock preview page
(one card with a full wind/wave/water-temp reading, one with the
water-temperature-fallback case) screenshotted and `axe-core`-checked
in both color schemes, zero violations, no overflow, then deleted
before committing; the live page was separately re-verified to still
correctly show only the water-temperature line when wind/wave are
`null`.

Sprint 31 (partial — text search only): `app/components/
location-search.tsx` is a hand-rolled [WAI-ARIA
combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) (no
dependency) — debounced, keyboard-navigable, distinct empty-results and
fetch-failure states — calling `app/api/locations/search/route.ts`, a
Route Handler that proxies apps/api's `GET /v1/locations/search`
through the signed internal path. This is the one place a Client
Component's `fetch` can land, since the browser must never call
apps/api directly (the signing secret is server-only). Demonstrated on
`app/locations/page.tsx`, where selecting a result links straight to
its `/forecast/{id}` page — search and forecast are separate
pages/concerns joined by a plain navigation link, not folded into one
page. Device geolocation, map search, and station-preview/ambiguity
states aren't attempted. Verified interactively via headless Chromium,
including the full search → select → view-forecast flow (typed a
query, saw one real matching result, arrow-keyed to it, pressed Enter,
clicked "View forecast," landed on a real rendered forecast page) — not
just curl, since this is the app's first genuinely interactive (Client
Component) UI.

Sprint 27 (design system) has a first pass: `app/globals.css` defines
light/dark design
tokens via Tailwind v4's `@theme` (colors, radius, font), starting from
`v2/frontend/src/index.css`'s teal/coral palette per
[`docs/R1_RECONCILIATION_AUDIT.md`](../../docs/R1_RECONCILIATION_AUDIT.md)
§3.2 ("Replace" applied to that app's `.button`/`.card`/`.field` global
CSS classes, not its color choices), plus semantic `go`/`marginal`/`nogo`
tokens for sprint 32's traffic-light dashboard headline. `app/components/ui/`
holds the accessible primitives that row's "gallery ... accessible
primitives" acceptance bar names: `Button` (real `<Link>` when `href` is
given, native `<button>` otherwise, visible focus ring), `Card`, `Badge`
(status pill — the verdict is always the visible text label, never color
alone), `Field` (label/hint/error wired together via `aria-describedby`/
`aria-invalid`, replacing §3.2's flagged `.field` class), and `Container`
(mobile-first responsive width). `app/page.tsx` is a gallery page
showcasing all of them at phone and desktop widths; `app/not-found.tsx`
is the trivial 404 R1's §3.1 disposition table names. **"Surf & Pier
Forecast" and this palette are a working placeholder identity, not a
final branding decision** — see `docs/CANONICAL_ROADMAP.md`'s sprint 27
row; the product owner has directed proceeding with Phase 3 work under
this placeholder rather than blocking on a name/visual-identity decision.
Full WCAG 2.2 AA verification (axe + keyboard/screen-reader evidence) and
i18n-ready string externalization remain sprint 40/27's respective
follow-up scope, not formally attempted here — but an `axe-core`
spot-check was run against every real page (`/`, `/locations`,
`/forecast/{id}`, the 404 page, both color schemes, plus the location
search dropdown open and the gallery's error `Field` in dark mode) and
found two genuine bugs, both fixed: (1) `--color-nogo-text` used
directly on the page background (Field's error message,
`ForecastErrorCard`) failed WCAG AA contrast in dark mode (2.6:1,
needs 4.5:1) — that token is correctly theme-invariant for `Badge`'s
own pill (its background is also theme-invariant, so the pairing was
never broken there), but bare status text needed its own
theme-adjusted token, `--color-danger-text`, added for exactly that
use; (2) `LocationSearch`'s dropdown used `<ul>`/`<li role="option">`,
which breaks ARIA's required-owned-elements relationship (overriding
`<li>`'s implicit "listitem" role to "option" makes the `<ul>` no
longer see real list items) — switched to plain `<div role="listbox">`/
`<div role="option">`, which carry no conflicting implicit role. Zero
violations across every page/state after both fixes. This is a
spot-check with today's real screens, not the formal sprint 40 audit
(no captured screen-reader-software evidence, no CI-wired regression
gate) — the general accessible-by-construction claim for sprint 27's
primitives already made above stands, now with automated verification
behind it rather than just design intent.

Real screens land in the remaining Phase 3 sprints (28
onward), reusing UX patterns catalogued as "Adapt" in
[`docs/R1_RECONCILIATION_AUDIT.md`](../../docs/R1_RECONCILIATION_AUDIT.md)
§3 rather than the `v2/frontend` implementation verbatim.

Lint is [`oxlint`](https://oxc.rs/), not `next lint` — Next.js 16 removed
the built-in `next lint` command, and `oxlint` is already the convention
used by `v2/frontend`.

## Local dev

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000 — should render the design-system gallery page.

### Calling apps/api locally

`/locations` and `/forecast/{id}` need apps/api running with a
**matching** signing key (see `apps/api/README.md`'s "Local dev"
section) — any value works as long as both sides agree:

```bash
# terminal 1, from apps/api
INTERNAL_SIGNING_KEY_ID=dev-key INTERNAL_SIGNING_KEY_SECRET=dev-secret-please-change \
  uvicorn app.main:app --reload --port 8000

# terminal 2, from apps/web
INTERNAL_API_BASE_URL=http://localhost:8000 \
INTERNAL_SIGNING_KEY_ID=dev-key INTERNAL_SIGNING_KEY_SECRET=dev-secret-please-change \
  npm run dev
```

Open http://localhost:3000/locations, search for a curated location
(e.g. "wrightsville"), and select it to view its forecast — or go
straight to http://localhost:3000/forecast/wrightsville-beach-nc. In
this sandboxed environment apps/api's own upstream (NOAA/NWS/NDBC)
calls are blocked
([`docs/R2_CI_BASELINE.md`](../../docs/R2_CI_BASELINE.md)'s
no-live-provider-dependence rule), so expect a gracefully degraded
forecast (state `partial`, confidence `low`, real warning messages) —
that's the signed path and the degradation path both working, not a
bug. Against real network access the same page renders a live forecast.

### Authentication locally

`/register`, `/login`, `/forgot-password`, and `/reset-password` need a
real local PostgreSQL database — Better Auth doesn't have a SQLite/
in-memory fallback story this app uses. One-time setup:

```bash
# create the database, a least-privilege role, and its own schema
sudo -u postgres psql <<'EOF'
CREATE DATABASE saltline;
CREATE ROLE saltline_web WITH LOGIN PASSWORD 'dev-password-please-change';
GRANT CONNECT ON DATABASE saltline TO saltline_web;
GRANT CREATE ON DATABASE saltline TO saltline_web;
\c saltline
CREATE SCHEMA auth AUTHORIZATION saltline_web;
REVOKE ALL ON SCHEMA public FROM saltline_web;
EOF

# apply Better Auth's own schema migration into that auth schema
DATABASE_URL="postgresql://saltline_web:dev-password-please-change@localhost:5432/saltline" \
BETTER_AUTH_SECRET=dev-secret-please-change-this-too \
  npm run migrate:auth
```

Then run the dev server with both set (`BETTER_AUTH_SECRET` is a real
secret in production — generate one with `openssl rand -hex 32` there,
this placeholder is dev-only):

```bash
DATABASE_URL="postgresql://saltline_web:dev-password-please-change@localhost:5432/saltline" \
BETTER_AUTH_SECRET=dev-secret-please-change-this-too \
  npm run dev
```

Open http://localhost:3000/register, create an account, and the header
should flip to "Sign out" immediately. Verification/reset emails aren't
actually sent unless `SMTP_HOST` (and friends — see CLAUDE.md's env var
table, reused verbatim) is also set; unset, `lib/email.ts` logs the link
to the server console instead, and new accounts skip email verification
entirely (`lib/auth.ts`'s `requireEmailVerification` follows
`SMTP_HOST`'s presence).

### Other environment variables

`NEXT_PUBLIC_SITE_URL` (optional, default `http://localhost:3000`) —
the real deployed origin, once one exists (Vercel isn't provisioned
yet, `docs/CANONICAL_ROADMAP.md`'s Phase 1 blockers 9/10). Used as
`app/layout.tsx`'s `metadataBase`, so every relative canonical/
OpenGraph URL (sprint 49) resolves correctly. Never needs setting for
local dev or `next build`.

## Checks

Run these from `apps/web` — they mirror `.github/workflows/apps-ci.yml`:

```bash
BETTER_AUTH_SECRET=ci-build-placeholder-not-a-real-secret npm run lint
BETTER_AUTH_SECRET=ci-build-placeholder-not-a-real-secret npm run build
```

`npm run build` completing without errors is the production-build smoke
test. `BETTER_AUTH_SECRET` doesn't need a *real* value to build — see
`lib/auth.ts`'s docstring — it just keeps the build log free of a
"using the default secret" warning; `DATABASE_URL` isn't needed at all
for `build` (`advanced.database.validateSchema` skips the startup DB
check when it's unset).
