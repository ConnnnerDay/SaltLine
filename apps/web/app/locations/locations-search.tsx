'use client'

import { useState } from 'react'
import { Button, Card, Container } from '@/app/components/ui'
import { LocationSearch } from '@/app/components/location-search'
import { UseMyLocationButton } from '@/app/components/use-my-location-button'
import type { LocationSearchResult } from '@/app/api/locations/search/route'

/**
 * Sprint 31 (text search plus device geolocation -- see LocationSearch's
 * and UseMyLocationButton's own docstrings for what's still deliberately
 * not attempted: map search and station-preview/ambiguity states).
 * Selecting a text-search result links to
 * app/forecast/[locationId]/page.tsx for a real forecast lookup --
 * search and forecast are separate pages/concerns, joined by a plain
 * navigation link rather than folded into one page. Geolocation instead
 * navigates straight there itself (see UseMyLocationButton) since a
 * device position resolves to exactly one point, nothing to confirm.
 *
 * Split out of page.tsx (sprint 29, "account-required routing"): the
 * session check that gates this whole page has to run server-side,
 * before any client code -- this file is that page's Client Component
 * body only, unauthenticated visitors never receive it.
 */
export function LocationsSearchPage() {
  const [selected, setSelected] = useState<LocationSearchResult | null>(null)

  return (
    <main>
      <Container>
        <header className="py-10 sm:py-16">
          <h1 className="text-3xl font-bold text-text sm:text-4xl">
            Find your spot
          </h1>
          <p className="mt-3 max-w-prose text-text-muted">
            Search 101 curated beaches, piers, and inlets from Texas to
            New Jersey.
          </p>
        </header>

        <div className="max-w-sm pb-16">
          <LocationSearch onSelect={setSelected} />

          <div className="mt-4 flex items-center gap-3 text-sm text-text-muted">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            or
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <div className="mt-4">
            <UseMyLocationButton />
          </div>

          {selected && (
            <Card className="mt-6 flex flex-col gap-3">
              <div>
                <h2 className="font-semibold text-text">{selected.name}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {selected.state} · {selected.lat.toFixed(3)}, {selected.lng.toFixed(3)}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  <code>{selected.id}</code>
                </p>
              </div>
              <Button
                variant="primary"
                href={`/forecast/${encodeURIComponent(selected.id)}`}
              >
                View forecast
              </Button>
            </Card>
          )}
        </div>
      </Container>
    </main>
  )
}
