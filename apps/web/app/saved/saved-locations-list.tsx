'use client'

import { useState } from 'react'
import { Button, Card } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import {
  deriveBestWindow,
  formatBestWindowRange,
  formatRange,
  VERDICT_TEXT,
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
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {locations.map((location) => (
        <li key={location.id} className="relative">
          <a
            href={`/forecast/${encodeURIComponent(location.location_id)}`}
            className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 pr-12 text-text no-underline shadow-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60"
          >
            <span>
              <span className="block text-lg font-bold leading-tight">{location.name}</span>
              <span className="block text-sm text-text-muted">{location.state}</span>
            </span>
            <LocationForecastSummary forecast={location.forecast} />
          </a>
          <button
            type="button"
            onClick={() => handleRemove(location.id)}
            disabled={removingId === location.id}
            aria-label={`Remove ${location.name} from saved spots`}
            className="absolute right-3 top-3 rounded-md p-2 text-text-muted hover:bg-bg hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
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
        </li>
      ))}
    </ul>
  )
}

function LocationForecastSummary({ forecast }: { forecast: ForecastEnvelope | null }) {
  if (!forecast) {
    return <p className="text-sm text-text-muted">Forecast unavailable right now</p>
  }

  const score = forecast.conditions?.score
  const verdict = score?.verdict ?? 'Unknown'
  const conditions = forecast.conditions
  const bestWindow = forecast.hourly_outlook ? deriveBestWindow(forecast.hourly_outlook) : null
  const facts = [
    conditions?.water_temperature && `${conditions.water_temperature.value.toFixed(0)}°F water`,
    conditions?.wind_range_kt && `${formatRange(conditions.wind_range_kt)} kt wind`,
    conditions?.wave_range_ft && `${formatRange(conditions.wave_range_ft, 0.5)} ft waves`,
  ].filter(Boolean)

  return (
    <span className="mt-auto flex flex-col gap-2">
      <span className={cx('text-2xl font-extrabold uppercase leading-none tracking-tight', VERDICT_TEXT[verdict])}>
        {verdict}
        {score && score.score !== null && (
          <span className="ml-2 text-base font-bold normal-case text-text-muted">
            {score.score}/100
          </span>
        )}
      </span>
      {facts.length > 0 && <span className="text-sm text-text-muted">{facts.join(' · ')}</span>}
      {bestWindow && (
        <span className="text-sm text-text">
          <span className="text-text-muted">Best </span>
          {formatBestWindowRange(bestWindow, forecast.location.timezone)}
        </span>
      )}
    </span>
  )
}
