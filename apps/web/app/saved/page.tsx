import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Container } from '@/app/components/ui'
import { auth } from '@/lib/auth'
import { internalApiFetch } from '@/lib/internal-api-client'
import { fetchForecast } from '@/lib/get-forecast'
import type { SavedLocation } from '@/app/api/saved-locations/route'
import { SavedLocationsList, type SavedLocationWithForecast } from './saved-locations-list'

// Each saved location's own forecast is live, per-request data, same
// reasoning as app/forecast/[locationId]/page.tsx.
export const dynamic = 'force-dynamic'

/**
 * Sprint 37's "ordered favorites... empty state" half -- app/components/
 * save-location-button.tsx (on the forecast page) is the "save" half,
 * this is where the list lives. Session-gated the same way
 * app/preferences/page.tsx and app/locations/page.tsx already are.
 *
 * Sprint 32's own docstring named the multi-location dashboard -- every
 * saved location's own go/no-go forecast, not just a list of names --
 * as its one remaining piece, deferred until sprint 37's saved
 * locations existed to list. That's what this page now does: it calls
 * `/v1/me/locations` directly (not through app/api/saved-locations/
 * route.ts's BFF proxy -- this is already server code, so the extra
 * HTTP hop back to itself would just add latency) and fans out one
 * `fetchForecast` per saved location in parallel, same call
 * app/forecast/[locationId]/page.tsx makes. `SavedLocationsList` then
 * renders each location with its own verdict badge and best-window
 * callout via `app/components/forecast-card.tsx`'s exported
 * `VERDICT_TO_BADGE`/`deriveBestWindow`/`formatBestWindowRange` --
 * the same mapping the full forecast page uses, not a second one
 * invented for this list. A location whose own forecast fetch fails
 * still renders (name, state, a link to the full page) rather than
 * taking down the whole dashboard over one bad source.
 */
export default async function SavedPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/login?next=/saved')
  }

  let locations: SavedLocationWithForecast[] | null = null
  let error: string | null = null
  try {
    const saved = await internalApiFetch<SavedLocation[]>('/v1/me/locations', {
      userId: session.user.id,
    })
    locations = await Promise.all(
      saved.map(async (location) => {
        try {
          const forecast = await fetchForecast(location.location_id)
          return { ...location, forecast }
        } catch {
          return { ...location, forecast: null }
        }
      }),
    )
  } catch {
    error = 'Could not load your saved locations.'
  }

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-sm flex-col gap-6 py-10 sm:py-16">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Saved spots</h1>
            <p className="mt-3 text-text-muted">Your saved locations, most recent last.</p>
          </header>
          <SavedLocationsList initialLocations={locations} initialError={error} />
        </div>
      </Container>
    </main>
  )
}
