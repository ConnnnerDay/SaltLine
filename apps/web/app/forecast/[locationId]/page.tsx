import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ForecastPageBody } from '@/app/components/forecast-page-body'
import { SaveLocationButton } from '@/app/components/save-location-button'
import type { ForecastEnvelope } from '@/app/components/forecast-card'
import { auth } from '@/lib/auth'
import { fetchForecast } from '@/lib/get-forecast'
import { InternalApiError } from '@/lib/internal-api-client'

// Forecasts are live, per-request data -- never build-time content. See
// app/forecast/[locationId]/page.tsx's git history / the roadmap
// checkpoint for why this matters with Next.js 16's static prerendering.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locationId: string }> }

const getForecast = cache(fetchForecast)

/**
 * The authenticated core forecast lookup (sprint 29, "account-required
 * routing" -- docs/product-definition.md's "account is required for the
 * core forecast experience"/"core browsing requires a verified
 * account"). Session checked server-side, same pattern
 * app/preferences/page.tsx and app/locations/page.tsx use:
 * `redirect()` fires before any fetch or render, an anonymous visitor
 * never reaches a real signed request to apps/api here.
 *
 * This route used to also be sprint 49's public, non-personalized share
 * page (real SEO metadata, no session needed) -- gating it here would
 * have silently dropped that surface, so it moved to its own route,
 * app/share/[locationId]/page.tsx, instead. That file and this one
 * share their visual layout via app/components/forecast-page-body.tsx
 * and their apps/api call via lib/get-forecast.ts, but stay separate
 * pages: one needs a session and links back to /locations' search, the
 * other doesn't and links back to /.
 *
 * A 404 from apps/api (unknown location_id) becomes this page's own
 * not-found state via `notFound()`, distinct from a generic fetch
 * failure.
 */
export default async function ForecastPage({ params }: Props) {
  const session = await auth.api.getSession({ headers: await headers() })
  const { locationId } = await params
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/forecast/${locationId}`)}`)
  }

  let forecast: ForecastEnvelope | null = null
  let error: string | null = null

  try {
    forecast = await getForecast(locationId)
  } catch (err) {
    if (err instanceof InternalApiError && err.status === 404) {
      notFound()
    }
    error = err instanceof Error ? err.message : 'Unknown error'
  }

  return (
    <ForecastPageBody
      forecast={forecast}
      error={error}
      backHref="/locations"
      backLabel="Back to search"
    >
      {forecast && (
        <div className="mt-4">
          <SaveLocationButton locationId={forecast.location.id} />
        </div>
      )}
    </ForecastPageBody>
  )
}
