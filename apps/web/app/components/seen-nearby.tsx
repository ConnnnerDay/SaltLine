import { requestUnits } from '@/lib/request-units'
import { distance } from '@/lib/units'
import { Suspense } from 'react'
import { internalApiFetch } from '@/lib/internal-api-client'
import { currentTime } from '@/lib/clock'
import { Card } from './ui'

/**
 * "Fish seen nearby lately": real, community-verified fish sightings
 * around the spot from iNaturalist (apps/api's
 * `GET /v1/locations/{id}/sightings`: research-grade observations from
 * the last 60 days within ~15 miles, freshwater families left out).
 * Evidence of what has actually been around, alongside the forecast's
 * season-based picks. Streams in after the page; hidden when iNaturalist
 * can't be reached. Photos are only shown when CC-licensed, always with
 * their credit, and every sighting links to its original record.
 */

type SeenSpecies = {
  name: string
  scientific_name: string
  count: number
  taxon_url: string
  photo_url: string | null
  photo_credit: string | null
}

type Sighting = {
  name: string
  scientific_name: string
  observed_on: string
  distance_miles: number
  place: string | null
  url: string
  photo_url: string | null
  photo_credit: string | null
}

type RecentSightings = {
  radius_miles: number
  days: number
  total_species: number
  species: SeenSpecies[]
  recent: Sighting[]
}

function daysAgo(isoDate: string, now: Date): string {
  const days = Math.round((now.getTime() - new Date(`${isoDate}T12:00:00`).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function Thumb({ src, alt, size = 'h-12 w-12' }: { src: string | null; alt: string; size?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={`${size} shrink-0 rounded-md bg-bg object-cover`} />
  ) : (
    <span aria-hidden="true" className={`flex ${size} shrink-0 items-center justify-center rounded-md bg-surface text-text-muted`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12c3-4 7-6 11-6 2.5 0 4.5 1 6 2l2-2v12l-2-2c-1.5 1-3.5 2-6 2-4 0-8-2-11-6z" />
      </svg>
    </span>
  )
}

async function SeenNearbyCard({ locationId }: { locationId: string }) {
  const data = await Promise.race([
    internalApiFetch<RecentSightings | null>(`/v1/locations/${encodeURIComponent(locationId)}/sightings`).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ])
  if (!data || (data.species.length === 0 && data.recent.length === 0)) return null
  const now = currentTime()
  const credits = [...data.species, ...data.recent]
    .map((item) => item.photo_credit)
    .filter((credit, index, all): credit is string => Boolean(credit) && all.indexOf(credit) === index)

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Fish seen nearby lately</h2>
        <span className="text-xs text-text-muted">
          {data.total_species} species · last {data.days} days · within {distance(data.radius_miles, requestUnits())}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {data.species.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold text-text">Most seen</h3>
            <ul className="grid grid-cols-2 gap-2">
              {data.species.map((species) => (
                <li key={species.scientific_name}>
                  <a
                    href={species.taxon_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-md border border-border bg-surface-raised p-2 text-text no-underline hover:border-primary"
                  >
                    <Thumb src={species.photo_url} alt={species.name} size="h-10 w-10 sm:h-12 sm:w-12" />
                    <span className="flex min-w-0 flex-col">
                      <span className="line-clamp-2 text-sm font-semibold leading-tight [overflow-wrap:anywhere]">{species.name}</span>
                      <span className="text-xs text-text-muted">
                        {species.count} {species.count === 1 ? 'sighting' : 'sightings'}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.recent.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold text-text">Latest sightings</h3>
            <ul className="flex flex-col gap-2">
              {data.recent.slice(0, 6).map((sighting) => (
                <li key={sighting.url}>
                  <a
                    href={sighting.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-md border border-border bg-surface-raised p-2 text-text no-underline hover:border-primary"
                  >
                    <Thumb src={sighting.photo_url} alt={sighting.name} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{sighting.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">{daysAgo(sighting.observed_on, now)}</span>
                      </span>
                      <span className="truncate text-xs text-text-muted">
                        {distance(sighting.distance_miles, requestUnits())} away{sighting.place ? ` · ${sighting.place}` : ''}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className="text-xs leading-relaxed text-text-muted">
        Community-verified observations from{' '}
        <a href="https://www.inaturalist.org" target="_blank" rel="noopener noreferrer">
          iNaturalist
        </a>
        : what people have actually found here lately, not a guarantee of what&apos;s biting. Tap any one
        to see the original record.
      </p>
      {credits.length > 0 && (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer font-semibold">Photo credits ({credits.length})</summary>
          <p className="mt-1.5 leading-relaxed">{credits.join('; ')}.</p>
        </details>
      )}
    </Card>
  )
}

export function SeenNearby({ locationId }: { locationId: string }) {
  return (
    <Suspense
      fallback={
        <Card aria-hidden="true" className="flex flex-col gap-4">
          <div className="h-3 w-40 animate-pulse rounded bg-border/70" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-border/70" />
            ))}
          </div>
        </Card>
      }
    >
      <SeenNearbyCard locationId={locationId} />
    </Suspense>
  )
}
