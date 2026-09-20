# Threat model

Sprint 44 ("Security hardening")'s last named piece, alongside CSP, CSRF,
the signed internal API, brute-force defense, and security headers — all
covered elsewhere (this document cites where). Scoped to what the product
actually is today per `docs/product-definition.md` and
`docs/CANONICAL_ROADMAP.md`'s "Recovery gates," not a hypothetical future
feature set: a public, account-required fishing-forecast web app with no
payments, no user-to-user features, and no data more sensitive than an
email address and a short list of saved coastal points.

## Method

Boundary-by-boundary, following `docs/architecture.md`'s system-context
diagram (reproduced below). For each boundary: what could go wrong, what
already mitigates it (with the real file or test that implements or
verifies the mitigation, not an aspirational claim), and what's an
accepted residual risk. Reviewed and updated whenever a new trust
boundary is added (a new external integration, a new mutating endpoint
class) or a mitigation changes — not a one-time document.

```text
Browser
  |
  | HTTPS; secure session cookie
  v
Next.js web + BFF  ------------------->  PostgreSQL auth schema
  |
  | HTTPS; signed short-lived internal request
  v
FastAPI forecast service  ------------>  PostgreSQL forecast schema
  |
  +--> NWS
  +--> NOAA CO-OPS
  +--> NDBC
```

## Assets

- **Account credentials and sessions** — email, password hash, session
  tokens. The only directly sensitive data this product holds.
- **User preferences and saved locations** — units, fishing style,
  thresholds, a short list of coastal points. Low sensitivity on their
  own (no precise home address is stored — see `docs/product-
  definition.md`'s "Background location tracking or retaining
  unnecessary precise coordinates" non-goal), but still real per-user
  data that shouldn't leak across accounts.
- **Service availability** — the forecast experience itself; a public
  product with no payment wall, so availability (not fraud) is the main
  business risk of abuse.
- **Upstream provider trust** — NWS/NOAA CO-OPS/NDBC are public
  government APIs with no credentials to leak, but a forecast built on
  tampered or spoofed data would misinform a real fishing decision.

## Actors

- **Anonymous internet users** — can reach the public share pages, the
  auth endpoints, and (per sprint 29) nothing else; the core forecast
  experience requires a verified account.
- **Registered users** — can read and write only their own preferences
  and saved locations; every mutating route resolves the acting user
  from the session, never a client-supplied id (see below).
- **A malicious or compromised third-party site** — the CSRF actor: gets
  a signed-in victim's browser to make a request to this app without the
  victim's intent.
- **This session's own explicit non-actor**: nothing in
  `docs/product-definition.md`'s v1 scope involves other users seeing or
  acting on a user's data (no social features, no sharing between
  accounts), so cross-user authorization is a simpler bar than a
  multi-tenant collaboration product would need.

## Boundary: browser to Next.js (the BFF)

| Threat | Mitigation | Evidence |
|---|---|---|
| Session token theft via XSS | `HttpOnly` session cookie (JS can never read it, even if a script injection occurred) | `lib/auth.ts` (Better Auth default); verified live — `Set-Cookie: better-auth.session_token=...; HttpOnly; SameSite=Lax` |
| Session token theft in transit | `Secure` cookie flag in production, HSTS | `lib/auth.ts`; `next.config.ts`'s `Strict-Transport-Security` header (sprint 44's original pass) |
| Cross-site request forgery on a mutating route (preferences, saved locations) | Two independent layers: (1) `SameSite=Lax` session cookie, never attached to a cross-site request for an unsafe method; (2) an explicit `Origin` header check in `lib/require-session-user-id.ts`, rejecting a mismatched origin with `403` before the session is even read | Verified live with a real cross-site `<form>` POST (not `fetch`, so not a CORS-only claim) — no session cookie attached, blocked before reaching apps/api; a second test manually attached a valid session cookie with a forged `Origin` header and got an explicit `403 origin mismatch`, proving the Origin check is a real second layer, not redundant with the cookie policy |
| Login/registration credential-guessing (brute force) | Per-action Better Auth rate limits, stricter than the app-wide default | `lib/auth.ts`'s `rateLimit.customRules` (`/sign-in/email`, `/sign-up/email`: 5/60s; `/send-verification-email`, `/request-password-reset`: 3/300s); verified live in sprint 28 — 7 rapid sign-in attempts allowed exactly 5 before a real `429` |
| Automated mass account creation (no CAPTCHA) | **Accepted residual risk, not mitigated.** Sign-up rate limiting (above) slows but doesn't stop scripted abuse from many IPs | Needs a real third-party provider (Cloudflare Turnstile or hCaptcha) and credentials this environment doesn't have — flagged the same way sprints 9/10's hosting credentials are flagged, not silently skipped |
| Open redirect via `?next=` | `lib/safe-redirect.ts` rejects any target that isn't a real same-origin relative path (blocks the classic `//evil.example.com` protocol-relative trick) | Used by `app/login/page.tsx`/`app/register/page.tsx`; sprint 29's row |
| Cross-user data access (reading or deleting another user's preferences/saved locations) | The acting user id always comes from the server-verified session (`lib/require-session-user-id.ts`), never a client-supplied id; apps/api's own routes additionally scope every query by that id and 404 (not 403) on a resource that exists but isn't the caller's, so a request can't even distinguish "doesn't exist" from "exists but isn't yours" | `apps/api/tests/test_preferences_router.py`/`test_saved_locations_router.py`'s per-user isolation tests |
| Clickjacking | `X-Frame-Options: DENY` (and CSP's implicit frame-ancestors posture) | `next.config.ts` |
| XSS via injected content in a rendered page | Self-only CSP (`default-src 'self'`, no third-party script origins except the one Google Fonts stylesheet allowance); React's default output-escaping for all rendered data (no `dangerouslySetInnerHTML` in this codebase) | `next.config.ts`'s CSP; verified live in sprint 44's original pass — zero real CSP violations from a full interactive walkthrough |
| MIME-sniffing-based content-type confusion | `X-Content-Type-Options: nosniff` | `next.config.ts` |

## Boundary: Next.js (BFF) to FastAPI

| Threat | Mitigation | Evidence |
|---|---|---|
| A network-addressable FastAPI accepting unauthenticated application requests (it's exposed for hosting/health checks, per ADR-004) | Every `/v1` route requires ADR-004's HMAC-SHA-256 signed-request contract (method, canonical path, body digest, issued-at, short expiry, request id, key id) via `require_internal_signature`, checked with constant-time comparison | `apps/api/app/infra/internal_signature.py`/`app/api/internal_auth.py`; `apps/api/tests/test_internal_signature.py`/`test_internal_auth.py`/`test_internal_api_wiring.py` (the last proves the dependency is actually wired into the real app, not just unit-tested in isolation) |
| Replay of a captured signed request | Short expiry window (`VALIDITY_SECONDS`) plus a required, unique request id | `apps/web/lib/internal-api-client.ts`; `apps/api/app/infra/internal_signature.py` |
| A BFF route impersonating a different user to FastAPI | The signed `X-Internal-User-Id` field is set exactly once, from the server-verified session (`lib/require-session-user-id.ts`) — never accepted as client input anywhere in the BFF | `app/api/preferences/route.ts`, `app/api/saved-locations/route.ts` |
| A compromised or buggy FastAPI route storing sensitive web-session data | Schema-per-concern ownership (ADR-006): `saltline_api`'s Postgres role has no grant on the `auth` schema at all — a bug in apps/api's own code can't read or write session/password data even if it tried | `docs/architecture.md`'s ADR-006; `apps/api/app/infra/database.py` |

## Boundary: FastAPI to external providers

| Threat | Mitigation | Evidence |
|---|---|---|
| Unbounded upstream latency or an upstream that never responds | Explicit connect/read/write/pool timeouts on every call | `apps/api/app/infra/http_client.py`'s `BoundedHTTPClient` |
| A malicious or misbehaving upstream returning an oversized response | A response-size limit enforced by streaming and counting bytes, not trusting `Content-Length` | `BoundedHTTPClient` |
| A transient upstream failure being retried forever, or a non-retriable error being retried uselessly | Bounded exponential-backoff retries limited to genuinely transient failures (connection errors, timeouts, 429/502/503/504) — never a 4xx that won't succeed on retry | `BoundedHTTPClient`; `apps/api/tests/test_http_client.py` |
| Malformed or unexpected upstream payload shapes reaching product logic unvalidated | Every provider adapter parses through typed Pydantic models before anything downstream sees the data; a parse failure becomes a structured `ProviderError`, not a raw exception leaking upstream internals | `apps/api/app/providers/*.py`; each has its own fixture-based parser tests |
| **Not a real threat for this product**: SSRF via a user-controlled upstream URL | Every outbound call target is a fixed, hardcoded government API host — no user input ever reaches a URL FastAPI fetches | N/A by construction |

## Boundary: database

| Threat | Mitigation | Evidence |
|---|---|---|
| SQL injection | All queries go through SQLAlchemy's parameterized query builder (`app/domain/preferences.py`, `app/domain/saved_locations.py`) — no raw string-interpolated SQL anywhere in either app | Code review of both domain modules; no `execute(f"...")`-style construction exists in the codebase |
| One app's compromise reaching the other app's data | Separate least-privilege Postgres roles (`saltline_web` owns only `auth`, `saltline_api` owns only `forecast`), each with no grant on the other's schema or on `public` | `docs/architecture.md`'s ADR-006; both apps' README "Local dev" sections show the exact `REVOKE`/`GRANT` statements |
| Credential leakage via logs | `apps/api/app/infra/request_logging.py`'s structured trace line explicitly logs only `request_id`/method/path (query string stripped)/status/duration — never headers, body, or connection strings; `apps/web/lib/internal-api-client.ts`'s matching trace line follows the same rule | Sprint 41's row; both modules' docstrings |

## Explicit non-goals / accepted residual risk

Naming these matters as much as the mitigations above — a threat model
that only lists what's covered is misleading by omission.

- **CAPTCHA/bot defense on registration** — not implemented, needs real
  third-party credentials this environment doesn't have. Rate limiting
  alone is a partial mitigation, not a substitute.
- **DDoS / volumetric abuse protection** — no WAF or edge rate limiting
  beyond Better Auth's own per-action limits. Vercel/Render's platform-
  level protections apply once those are actually provisioned (sprints
  9/10's standing credentials gap); nothing app-level exists today.
- **Continuous dependency-vulnerability scanning** — `npm audit`/`pip`
  equivalent checks have been run and fixed reactively when noticed
  (see sprint 28's `next`/`sharp` advisory fixes in `apps/web/README.md`),
  not wired into CI as an ongoing gate.
- **Physical/infrastructure security** — Vercel, Render, and Neon's
  responsibility once provisioned; out of this product's own scope.
- **Session fixation** — Better Auth's session issuance on login isn't
  independently re-verified here beyond trusting its own security
  posture as a maintained library; no custom session-handling code in
  this app to separately audit.
- **Live-upstream-specific threats** (e.g., a compromised NWS/NOAA/NDBC
  response reaching real users) are untestable in this sandboxed
  environment's blocked-network conditions — the parsing/validation
  mitigations above are evidence-based from fixture tests, not a live
  adversarial test against the real government APIs.

## Keeping this current

Update this document, not just the code, whenever: a new trust boundary
is added (a new external integration, a new class of mutating endpoint,
a new stored-data type); a mitigation listed here changes or is removed;
or a residual risk above gets resolved (e.g., CAPTCHA credentials become
available). `docs/CANONICAL_ROADMAP.md`'s sprint 44 row points here.
