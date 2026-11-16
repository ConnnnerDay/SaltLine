import { cache } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ForecastPageBody } from '@/app/components/forecast-page-body'
import { Button } from '@/app/components/ui'
import type { ForecastEnvelope } from '@/app/components/forecast-card'
import { auth } from '@/lib/auth'
import { fetchForecast } from '@/lib/get-forecast'
import { fetchNearbyCams } from '@/lib/get-cams'
import { logForecastFailure, userFacingReason } from '@/lib/diagnose-api'
import { InternalApiError } from '@/lib/internal-api-client'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locationId: string }> }

const getForecast = cache(fetchForecast)

/**
 * Sprint 49's "public non-personal forecast pages (organic-growth
 * surface)": real per-location title/description/canonical/OpenGraph
 * metadata, not the root layout's generic default. Moved here verbatim
 * from app/forecast/[locationId]/page.tsx (sprint 29 gated that route
 * behind a session -- see this file's own module docstring) with only
 * the canonical path updated to match. The description is deliberately
 * static copy about the location, never live score/warning text -- a
 * degraded-conditions sentence has no business being cached into a
 * search result or link-preview card. A 404 (unknown `location_id`)
 * calls `notFound()` here too, matching the page body below.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locationId } = await params

  let forecast: ForecastEnvelope | null = null
  try {
    forecast = await getForecast(locationId)
  } catch (err) {
    if (err instanceof InternalApiError && err.status === 404) {
      notFound()
    }
    return { title: 'Forecast' }
  }

  const title = `${forecast.location.label} Fishing Forecast`
  const description = `Surf and pier fishing conditions for ${forecast.location.label}: wind, waves, water temperature, tides, and the best times to fish today.`
  const canonicalPath = `/share/${encodeURIComponent(locationId)}`

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: { title, description, url: canonicalPath },
  }
}

/**
 * The public, non-personalized share page (sprint 49) -- split out of
 * app/forecast/[locationId]/page.tsx when sprint 29 gated that route
 * behind a session (docs/product-definition.md's "account is required
 * for the core forecast experience"). No auth check: this is the one
 * forecast surface an anonymous visitor, or a search engine, can
 * actually reach, exactly the "organic-growth surface" the round-2
 * product decision pulled forward as v1-required. Shares its visual
 * layout with the authenticated page via
 * app/components/forecast-page-body.tsx and its apps/api call via
 * lib/get-forecast.ts -- the only real differences are this page's own
 * SEO metadata above, its back link going to `/` (the one route an
 * anonymous visitor can reach, not `/locations`' now-gated search), and
 * the sign-up call to action below.
 */
export default async function SharedForecastPage({ params }: Props) {
  const { locationId } = await params
  // Signed-in visitors don't need the sign-up prompt (and "/" already
  // opens their own spot).
  const session = await auth.api.getSession({ headers: await headers() })

  let forecast: ForecastEnvelope | null = null
  let error: string | null = null
  let errorReason: string | null = null
  const camsPromise = fetchNearbyCams(locationId)

  try {
    forecast = await getForecast(locationId)
  } catch (err) {
    if (err instanceof InternalApiError && err.status === 404) {
      notFound()
    }
    logForecastFailure(locationId, err)
    errorReason = userFacingReason(err)
    error = err instanceof Error ? err.message : 'Unknown error'
  }

  return (
    <ForecastPageBody
      forecast={forecast}
      error={error}
      errorReason={errorReason}
      cams={await camsPromise}
      retryHref={`/share/${encodeURIComponent(locationId)}`}
      backHref="/"
      backLabel="Back to Saltline"
    >
      {!session && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface shadow-card px-5 py-6 text-center">
          <p className="text-sm text-text">
            Want a straight go/no-go answer for your own spot?
          </p>
          <Button variant="primary" href="/register">
            Create a free account
          </Button>
        </div>
      )}
    </ForecastPageBody>
  )
}
