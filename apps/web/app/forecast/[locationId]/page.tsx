import { cache } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ForecastPageBody } from '@/app/components/forecast-page-body'
import { AlertControl } from '@/app/components/alert-control'
import { SaveLocationButton } from '@/app/components/save-location-button'
import { Button } from '@/app/components/ui'
import type { ForecastEnvelope } from '@/app/components/forecast-card'
import { auth } from '@/lib/auth'
import type { Preferences } from '@/app/api/preferences/route'
import type { SavedLocation } from '@/app/api/saved-locations/route'
import type { SwitcherSpot } from '@/app/components/spot-switcher'
import { fetchForecast } from '@/lib/get-forecast'
import { setRequestUnits } from '@/lib/request-units'
import { fetchNearbyCams } from '@/lib/get-cams'
import { logForecastFailure, userFacingReason } from '@/lib/diagnose-api'
import { InternalApiError, internalApiFetch } from '@/lib/internal-api-client'
import { NOT_COASTAL } from '@/app/components/forecast-card'

// Forecasts are live, per-request data -- never build-time content. See
// app/forecast/[locationId]/page.tsx's git history / the roadmap
// checkpoint for why this matters with Next.js 16's static prerendering.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locationId: string }> }

const getForecast = cache(fetchForecast)

/** "<Spot> forecast" in the tab and history, from the same cached
 * request the page body makes (no extra fetch). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locationId } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { title: 'Forecast' }
  const forecast = await getForecast(locationId, session.user.id).catch(() => null)
  return { title: forecast ? `${forecast.location.label} forecast` : 'Forecast' }
}

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
  let errorReason: string | null = null
  const profilePromise = internalApiFetch<Preferences>('/v1/me/preferences', {
    userId: session.user.id,
  }).catch(() => null)
  const savedPromise = internalApiFetch<SavedLocation[]>('/v1/me/locations', {
    userId: session.user.id,
  }).catch(() => [] as SavedLocation[])
  const camsPromise = Promise.all([fetchNearbyCams(locationId), profilePromise]).then(
    ([cams, prefs]) =>
      // As in the original app: someone who doesn't fish piers isn't shown pier cams.
      prefs?.fishing_types?.length && !prefs.fishing_types.includes('pier')
        ? cams.filter((cam) => cam.cam_type !== 'pier')
        : cams,
  )

  try {
    forecast = await getForecast(locationId, session.user.id)
  } catch (err) {
    if (err instanceof InternalApiError && err.status === 404) {
      notFound()
    }
    if (err instanceof InternalApiError && err.status === 422) {
      error = NOT_COASTAL
    } else {
      logForecastFailure(locationId, err)
      errorReason = userFacingReason(err)
      error = err instanceof Error ? err.message : 'Unknown error'
    }
  }

  // The location bar's quick switcher: home spot first, then saved spots.
  const [profile, saved] = await Promise.all([profilePromise, savedPromise])
  setRequestUnits(profile?.units)
  const homeId = profile?.default_location_id ?? null
  const switcherSpots: SwitcherSpot[] = saved
    .map((spot) => ({ id: spot.location_id, name: spot.name, state: spot.state, home: spot.location_id === homeId }))
    .sort((a, b) => Number(Boolean(b.home)) - Number(Boolean(a.home)))
  if (homeId && !switcherSpots.some((spot) => spot.id === homeId)) {
    // A home spot that isn't also saved: name it from the curated list
    // (or this page, for a custom pinned home spot being viewed now).
    const curated = await internalApiFetch<{ id: string; name: string; state: string }[]>('/v1/locations', {
      userId: session.user.id,
    }).catch(() => [])
    const home = curated.find((spot) => spot.id === homeId)
    if (home) switcherSpots.unshift({ id: home.id, name: home.name, state: home.state, home: true })
    else if (forecast?.location.id === homeId)
      switcherSpots.unshift({ id: homeId, name: forecast.location.label, state: '', home: true })
  }

  return (
    <ForecastPageBody
      switcherSpots={switcherSpots}
      forecast={forecast}
      error={error}
      errorReason={errorReason}
      cams={await camsPromise}
      profile={profile}
      nearbyLinkBase="/forecast"
      userId={session.user.id}
      retryHref={`/forecast/${encodeURIComponent(locationId)}`}
      backHref="/locations"
      backLabel="Back to search"
      barActions={
        forecast && (
          <SaveLocationButton
            compact
            locationId={forecast.location.id}
            initiallySaved={saved.some((spot) => spot.location_id === forecast.location.id)}
          />
        )
      }
    >
      {forecast && (
        <div className="flex flex-col gap-3">
          <AlertControl locationId={forecast.location.id} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              href={`/log?location=${encodeURIComponent(forecast.location.id)}`}
            >
              Log a catch here
            </Button>
          </div>
        </div>
      )}
    </ForecastPageBody>
  )
}
