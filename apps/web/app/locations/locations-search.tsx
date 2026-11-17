'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Container } from '@/app/components/ui'
import { rememberHomeIfUnset } from '@/lib/remember-home'
import { LocationSearch } from '@/app/components/location-search'
import { UseMyLocationButton } from '@/app/components/use-my-location-button'
import { SpotMap } from '@/app/components/spot-map'

/**
 * Sprint 31 (text search plus device geolocation -- see LocationSearch's
 * and UseMyLocationButton's own docstrings for what's still deliberately
 * not attempted: map search and station-preview/ambiguity states).
 * Selecting a text-search result goes straight to
 * app/forecast/[locationId]/page.tsx -- picking a spot *is* asking for
 * its forecast, so there's no second "View forecast" step (users read
 * the old confirm card as "signed up but no forecast"). The first spot a
 * user picks also becomes their home spot (`rememberHomeIfUnset`), which
 * "/" then opens to. Geolocation does the same (see UseMyLocationButton).
 *
 * Split out of page.tsx (sprint 29, "account-required routing"): the
 * session check that gates this whole page has to run server-side,
 * before any client code -- this file is that page's Client Component
 * body only, unauthenticated visitors never receive it.
 */
export type BrowseLocation = {
  id: string
  name: string
  state: string
  lat: number
  lng: number
  conditions_region: string
}

const COASTS: { title: string; match: (region: string) => boolean; order: (a: BrowseLocation, b: BrowseLocation) => number }[] = [
  // North to south along each coast; the Gulf runs west to east.
  { title: 'Atlantic', match: (r) => r.startsWith('atlantic'), order: (a, b) => b.lat - a.lat },
  { title: 'Gulf of Mexico', match: (r) => r === 'gulf', order: (a, b) => a.lng - b.lng },
  { title: 'Pacific', match: (r) => r.startsWith('pacific'), order: (a, b) => b.lat - a.lat },
  { title: 'Hawaii', match: (r) => r.startsWith('hawaii'), order: (a, b) => a.lng - b.lng },
]

export function LocationsSearchPage({ locations = [] }: { locations?: BrowseLocation[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)

  async function handleSelect(location: { id: string; name: string }) {
    setSelected(location)
    await rememberHomeIfUnset(location.id)
    router.push(`/forecast/${encodeURIComponent(location.id)}`)
  }

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10 pb-16 sm:py-14">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Find your spot</h1>
            <p className="mt-3 text-text-muted">
              Search {locations.length || 101} curated beaches, piers, and inlets on the
              Atlantic, Gulf, Pacific, and Hawaii coasts, or use your current location.
            </p>
          </header>

          <Card className="flex flex-col gap-4">
            <LocationSearch onSelect={handleSelect} />
            <div className="flex items-center gap-3 text-sm text-text-muted">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              or
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <UseMyLocationButton />
          </Card>

          {selected && (
            <Card role="status" aria-live="polite">
              <p className="text-sm text-text-muted">
                Loading the forecast for{' '}
                <span className="font-semibold text-text">{selected.name}</span>…
              </p>
            </Card>
          )}

          {locations.length > 0 && (
            <section aria-labelledby="map-heading" className="flex flex-col gap-3">
              <h2 id="map-heading" className="section-label">
                Or pick one on the map
              </h2>
              <SpotMap spots={locations} selectedId={selected?.id ?? null} onSelect={(spot) => void handleSelect(spot)} />
            </section>
          )}

          {locations.length > 0 && (
            <section aria-labelledby="browse-heading" className="flex flex-col gap-4">
              <h2 id="browse-heading" className="section-label">
                Or browse the list
              </h2>
              {COASTS.map((coast) => {
                const spots = locations
                  .filter((location) => coast.match(location.conditions_region))
                  .sort(coast.order)
                if (spots.length === 0) return null
                return (
                  <details key={coast.title} className="collapsible group rounded-lg border border-border bg-surface shadow-card">
                    <summary className="flex min-h-14 items-center justify-between gap-3 rounded-lg px-5 py-3.5 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-6">
                      <span className="flex items-baseline gap-3">
                        <span className="font-bold text-text">{coast.title}</span>
                        <span className="text-xs text-text-muted">{spots.length} spots</span>
                      </span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="chevron shrink-0 text-text-muted group-hover:text-text">
                        <path d="M6 9 L12 15 L18 9" />
                      </svg>
                    </summary>
                    <ul className="grid grid-cols-1 gap-1 px-3 pb-4 sm:grid-cols-2 sm:px-4">
                      {spots.map((spot) => (
                        <li key={spot.id}>
                          <a
                            href={`/forecast/${encodeURIComponent(spot.id)}`}
                            onClick={(event) => {
                              event.preventDefault()
                              void handleSelect(spot)
                            }}
                            className="flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm text-text no-underline hover:bg-surface-raised"
                          >
                            <span className="font-semibold">{spot.name}</span>
                            <span className="text-xs text-text-muted">{spot.state}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })}
            </section>
          )}
        </div>
      </Container>
    </main>
  )
}
