/**
 * Sprint 38 ("PWA baseline")'s service worker -- the piece
 * `experimental.useOffline` (next.config.ts) explicitly can't be: that
 * flag only retries a *soft* navigation into an already-prefetched
 * route (see node_modules/next/dist/docs/01-app/02-guides/
 * offline-support.md's own "full offline loads would need a service
 * worker" note). This is what makes a hard reload, a deep link, or
 * opening the installed PWA fresh actually work offline, per this
 * sprint's acceptance bar ("full offline navigation... not just
 * last-cached-forecast viewing").
 *
 * Hand-written, not Workbox/Serwist: this app has no bundler-level SW
 * build step (Next.js ships none itself -- the same docs page points
 * to Serwist as *one option*, not a requirement), and a runtime-
 * caching strategy (cache pages as they're visited) sidesteps the real
 * problem a hand-rolled *precache* strategy would hit: Turbopack's
 * output filenames are content-hashed per build, so a static list of
 * asset URLs written into this file would go stale on every deploy.
 * `CORE_SHELL` below is deliberately small: only URLs Next.js itself
 * guarantees are stable across builds (route paths, not hashed asset
 * files).
 *
 * Bump CACHE_VERSION when this file's caching *logic* changes (not on
 * every app deploy -- navigation caching is network-first, so a stale
 * cached shell only ever serves when the visitor has no network
 * anyway, per the module-level comment on PAGE_CACHE_PATHS below).
 */
const CACHE_VERSION = 'saltline-v1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const PAGE_CACHE = `${CACHE_VERSION}-pages`
const ASSET_CACHE = `${CACHE_VERSION}-assets`

const CORE_SHELL = ['/', '/offline', '/manifest.webmanifest', '/icon-192', '/icon-512']

/**
 * Only these path prefixes get their navigation responses cached for
 * offline replay. Deliberately excludes `/saved`, `/preferences`, and
 * `/account`: those render a signed-in user's own personal data (their
 * saved-location list, their settings) server-side into the HTML, and
 * this cache is Cache Storage -- shared by every account that ever
 * signs into this browser profile, not scoped per session. `/forecast/*`
 * and `/share/*` render a *location's* data, not an account's, so
 * caching them carries no equivalent cross-account leak risk on a
 * shared device. `/locations` is the search shell (no result data
 * until a query resolves), safe to cache indefinitely.
 */
const PAGE_CACHE_PATHS = ['/', '/locations', '/forecast/', '/share/']

/**
 * Only `/forecast/*` and `/share/*` embed live scored conditions --
 * matching docs/product-definition.md's 4-hour freshness window
 * (docs/CANONICAL_ROADMAP.md's round-2 decision, same value
 * apps/api's SnapshotCache.fresh_ttl_seconds defaults to). Past this
 * age, a cached copy is more likely to mislead ("go fishing now" for
 * conditions that changed hours ago) than to help -- the offline
 * fallback page is the honest answer at that point, per this sprint's
 * "authenticated forecasts not cached forever" requirement.
 */
const FORECAST_TTL_MS = 4 * 60 * 60 * 1000
const FORECAST_TTL_PATHS = ['/forecast/', '/share/']
const CACHED_AT_HEADER = 'x-saltline-cached-at'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(CORE_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, PAGE_CACHE, ASSET_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function isPageCacheable(url) {
  return PAGE_CACHE_PATHS.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix))
}

function ttlForPath(pathname) {
  return FORECAST_TTL_PATHS.some((prefix) => pathname.startsWith(prefix)) ? FORECAST_TTL_MS : null
}

async function putWithTimestamp(cache, request, response) {
  const stamped = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  })
  stamped.headers.set(CACHED_AT_HEADER, Date.now().toString())
  await cache.put(request, stamped)
}

async function respondToNavigation(request) {
  const url = new URL(request.url)
  const cache = await caches.open(url.pathname === '/offline' ? SHELL_CACHE : PAGE_CACHE)

  try {
    const response = await fetch(request)
    if (response.ok && isPageCacheable(url)) {
      await putWithTimestamp(cache, request, response.clone())
    }
    return response
  } catch {
    const cached = (await cache.match(request)) ?? (await (await caches.open(SHELL_CACHE)).match(request))
    if (cached) {
      const ttl = ttlForPath(url.pathname)
      const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER) ?? 0)
      const isStale = ttl !== null && cachedAt !== 0 && Date.now() - cachedAt > ttl
      if (!isStale) return cached
    }
    return (
      (await (await caches.open(SHELL_CACHE)).match('/offline')) ??
      new Response('Offline', { status: 503, statusText: 'Offline' })
    )
  }
}

async function respondToAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only ever serve GET from cache -- a cached response to a mutating
  // request (a form POST, a Server Action) would silently discard the
  // actual write. Everything non-GET, and every cross-origin request
  // (this app's own signed apps/api calls are server-side only, never
  // browser-issued -- ADR-004 -- so this worker never legitimately
  // sees one), passes straight through to the network untouched.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(respondToNavigation(request))
    return
  }

  const url = new URL(request.url)
  // Next's build output (hashed, safe to cache forever) and this app's
  // own static image/icon routes -- never API routes or RSC data
  // fetches, which carry live or per-user data.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon')) {
    event.respondWith(respondToAsset(request))
  }
})
