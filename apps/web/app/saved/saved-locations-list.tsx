'use client'

import { useState } from 'react'
import { Badge, Button, Card } from '@/app/components/ui'
import {
  deriveBestWindow,
  formatBestWindowRange,
  VERDICT_TO_BADGE,
  type ForecastEnvelope,
} from '@/app/components/forecast-card'
import type { SavedLocation } from '@/app/api/saved-locations/route'

export type SavedLocationWithForecast = SavedLocation & { forecast: ForecastEnvelope | null }

/**
 * Sprint 32's multi-location dashboard: `app/saved/page.tsx` fetches
 * each saved location's own forecast server-side (in parallel, one
 * `fetchForecast` per location) and passes the result here rather than
 * this component re-fetching client-side -- the same data the old
 * bare-links version needed anyway, so there's no reason to pay for it
 * twice or show a loading flicker for it. Delete still goes through the
 * `/api/saved-locations/[id]` BFF proxy client-side (the browser never
 * calls apps/api directly, ADR-004) and just removes the row from local
 * state -- no need to touch its forecast data.
 */
export function SavedLocationsList({
  initialLocations,
  initialError,
}: {
  initialLocations: SavedLocationWithForecast[] | null
  initialError: string | null
}) {
  const [locations, setLocations] = useState(initialLocations)
  const [error, setError] = useState(initialError)
  const [removingId, setRemovingId] = useState<number | null>(null)

  async function handleRemove(id: number) {
    setRemovingId(id)
    const response = await fetch(`/api/saved-locations/${id}`, { method: 'DELETE' })
    setRemovingId(null)
    if (!response.ok) {
      setError('Could not remove that location.')
      return
    }
    setLocations((current) => current?.filter((loc) => loc.id !== id) ?? current)
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm text-danger-text" role="alert">
          {error}
        </p>
      </Card>
    )
  }

  if (locations === null) return null

  if (locations.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <p className="text-text-muted">No saved spots yet.</p>
        <Button variant="primary" href="/locations">
          Find your spot
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {locations.map((location) => (
        <Card key={location.id} className="flex items-center justify-between gap-3">
          <a
            href={`/forecast/${encodeURIComponent(location.location_id)}`}
            className="flex flex-1 flex-col gap-1.5 text-text no-underline"
          >
            <span>
              <span className="font-semibold">{location.name}</span>
              <span className="block text-sm text-text-muted">{location.state}</span>
            </span>
            <LocationForecastSummary forecast={location.forecast} />
          </a>
          <button
            type="button"
            onClick={() => handleRemove(location.id)}
            disabled={removingId === location.id}
            aria-label={`Remove ${location.name} from saved spots`}
            className="shrink-0 self-start rounded-md p-2 text-text-muted hover:bg-bg hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7 L20 7" />
              <path d="M9 7 V5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V7" />
              <path d="M6 7 L7 20 a1 1 0 0 0 1 1 h8 a1 1 0 0 0 1 -1 L19 7" />
            </svg>
          </button>
        </Card>
      ))}
    </div>
  )
}

/**
 * The one piece of the row that's new this sprint: each saved
 * location's own go/no-go verdict and best window, the same
 * `VERDICT_TO_BADGE`/`deriveBestWindow` mapping the full forecast page
 * uses, at a glance rather than requiring a tap-through to see it. A
 * location whose own forecast fetch failed (a real apps/api error, not
 * this sprint's concern to retry inline) shows a plain muted note
 * instead of a badge -- the row itself, and the link to the full page,
 * still work.
 */
function LocationForecastSummary({ forecast }: { forecast: ForecastEnvelope | null }) {
  if (!forecast) {
    return <p className="text-sm text-text-muted">Forecast unavailable</p>
  }

  const verdict = forecast.conditions?.score?.verdict ?? 'Unknown'
  const bestWindow = forecast.hourly_outlook ? deriveBestWindow(forecast.hourly_outlook) : null

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant={VERDICT_TO_BADGE[verdict]}>{verdict}</Badge>
      {bestWindow && (
        <span className="text-sm text-text-muted">
          Best {formatBestWindowRange(bestWindow, forecast.location.timezone)}
        </span>
      )}
    </span>
  )
}
