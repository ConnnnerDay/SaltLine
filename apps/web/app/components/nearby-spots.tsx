import { Suspense } from 'react'
import { fetchForecast } from '@/lib/get-forecast'
import { internalApiFetch } from '@/lib/internal-api-client'
import { formatRange, VERDICT_TEXT, type ForecastEnvelope } from './forecast-card'
import { Card } from './ui'
import { cx } from './ui/cx'

/**
 * "Nearby spots today": today's call at the closest other curated spots
 * (apps/api's `GET /v1/locations/{id}/nearby`, within 60 miles), so a
 * blown-out beach can point to a fishable one next door -- a different
 * shoreline often faces the wind differently.
 *
 * It streams: the forecast page renders without waiting for it (React
 * Suspense with a placeholder), each nearby forecast is capped at
 * `TIMEOUT_MS`, and anything that fails is simply left out. A spot that
 * scores clearly better than this one is highlighted.
 */

type NearbySpot = { id: string; name: string; state: string; distance_miles: number }

const TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ])
}

async function NearbyList({
  locationId,
  currentScore,
  linkBase,
  userId,
}: {
  locationId: string
  currentScore: number | null
  linkBase: string
  userId?: string
}) {
  const spots = await withTimeout(
    internalApiFetch<NearbySpot[]>(`/v1/locations/${encodeURIComponent(locationId)}/nearby`),
  )
  if (!spots || spots.length === 0) return null
  const forecasts = await Promise.all(spots.map((spot) => withTimeout(fetchForecast(spot.id, userId))))
  const rows = spots
    .map((spot, index) => ({ spot, forecast: forecasts[index] as ForecastEnvelope | null }))
    .filter((row) => row.forecast?.conditions?.score)
  if (rows.length === 0) return null

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Nearby spots today</h2>
        <span className="text-xs text-text-muted">Closest curated spots within 60 miles</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map(({ spot, forecast }) => {
          const conditions = forecast!.conditions!
          const score = conditions.score!
          const better = currentScore !== null && score.score !== null && score.score >= currentScore + 10
          return (
            <li key={spot.id}>
              <a
                href={`${linkBase}/${encodeURIComponent(spot.id)}`}
                className={cx(
                  'flex h-full flex-col gap-2 rounded-md border bg-surface-raised p-3.5 text-text no-underline transition-colors hover:border-primary',
                  better ? 'border-go-border' : 'border-border',
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-bold leading-tight">{spot.name}</span>
                  <span className="shrink-0 text-xs text-text-muted">{Math.round(spot.distance_miles)} mi</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className={cx('text-lg font-extrabold uppercase leading-none', VERDICT_TEXT[score.verdict])}>
                    {score.verdict}
                  </span>
                  {score.score !== null && (
                    <span className="text-sm font-semibold tabular-nums text-text-muted">{score.score}</span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-text-muted">
                  {[
                    conditions.wind_range_kt && `${conditions.wind_direction ?? ''} ${formatRange(conditions.wind_range_kt)} kt`.trim(),
                    conditions.wave_range_ft && `${formatRange(conditions.wave_range_ft, 0.5)} ft`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {better && (
                  <span className="w-fit rounded-full bg-go-bg px-2 py-0.5 text-xs font-bold text-go-text">
                    Better than here today
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function NearbySpots(props: {
  locationId: string
  currentScore: number | null
  linkBase: string
  userId?: string
}) {
  return (
    <Suspense
      fallback={
        <Card aria-hidden="true" className="flex flex-col gap-4">
          <div className="h-3 w-36 animate-pulse rounded bg-border/70" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-md bg-border/70" />
            ))}
          </div>
        </Card>
      }
    >
      <NearbyList {...props} />
    </Suspense>
  )
}
