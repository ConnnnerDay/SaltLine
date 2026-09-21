'use client'

import { BrandMark } from '../components/brand-mark'
import { Button, Container } from '../components/ui'

/**
 * Sprint 38 ("PWA baseline")'s offline fallback -- what `public/sw.js`
 * serves for a navigation request it can't fulfill from the network or
 * from its own cache (an unvisited page, or a `forecast`/`share` cache
 * entry old enough that showing it would misrepresent current
 * conditions -- see that file's `FORECAST_TTL_MS`). Deliberately a real
 * route, not a raw string the service worker fabricates: it gets the
 * same Saltline chrome (`BrandMark`, `Container`) as `not-found.tsx`,
 * and `public/sw.js` precaches it at `install` time specifically so
 * it's always available to serve, the one entry that must never itself
 * be a cache miss.
 *
 * `'use client'` only for the retry button's `location.reload()` --
 * everything else here is static markup, same as `not-found.tsx`.
 */
export default function OfflinePage() {
  return (
    <main>
      <Container>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-20 text-center">
          <BrandMark className="h-9 w-9" />
          <h1 className="text-3xl font-bold text-text sm:text-4xl">You&apos;re offline</h1>
          <p className="max-w-sm text-text-muted">
            This page isn&apos;t available without a connection. Spots and forecasts
            you&apos;ve already opened recently may still work from the app menu.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" variant="primary" onClick={() => location.reload()}>
              Try again
            </Button>
            <Button variant="secondary" href="/">
              Back home
            </Button>
          </div>
        </div>
      </Container>
    </main>
  )
}
