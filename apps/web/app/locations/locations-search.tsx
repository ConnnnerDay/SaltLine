'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Container } from '@/app/components/ui'
import { rememberHomeIfUnset } from '@/lib/remember-home'
import { LocationSearch } from '@/app/components/location-search'
import { UseMyLocationButton } from '@/app/components/use-my-location-button'
import type { LocationSearchResult } from '@/app/api/locations/search/route'

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
export function LocationsSearchPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<LocationSearchResult | null>(null)

  async function handleSelect(location: LocationSearchResult) {
    setSelected(location)
    await rememberHomeIfUnset(location.id)
    router.push(`/forecast/${encodeURIComponent(location.id)}`)
  }

  return (
    <main>
      <Container>
        <header className="py-10 sm:py-16">
          <h1 className="text-3xl font-bold text-text sm:text-4xl">
            Find your spot
          </h1>
          <p className="mt-3 max-w-prose text-text-muted">
            Search 101 curated beaches, piers, and inlets on the Atlantic, Gulf,
            Pacific, and Hawaii coasts, or use your current location.
          </p>
        </header>

        <div className="max-w-sm pb-16">
          <LocationSearch onSelect={handleSelect} />

          <div className="mt-4 flex items-center gap-3 text-sm text-text-muted">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            or
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <div className="mt-4">
            <UseMyLocationButton />
          </div>

          {selected && (
            <Card className="mt-6" role="status" aria-live="polite">
              <p className="text-sm text-text-muted">
                Loading the forecast for{' '}
                <span className="font-semibold text-text">{selected.name}</span>…
              </p>
            </Card>
          )}
        </div>
      </Container>
    </main>
  )
}
