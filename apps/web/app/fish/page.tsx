import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Container } from '@/app/components/ui'
import { monthIn } from '@/lib/zoned-time'
import { auth } from '@/lib/auth'
import { internalApiFetch } from '@/lib/internal-api-client'
import type { Preferences } from '@/app/api/preferences/route'
import { toGuideFish, type FishSummary } from '@/lib/fish'
import { FishGuide } from './fish-guide'
import { SPECIES_PHOTOS } from '@/app/components/species-photo'

export const metadata: Metadata = { title: 'Fish guide' }

export const dynamic = 'force-dynamic'

/**
 * The Fish guide: every fish in the catalogue "What's biting" ranks
 * (apps/api `/v1/species`), searchable and filterable by region and
 * season, each opening its own page (./[speciesId]). Opens on the
 * signed-in user's home region, in season this month first.
 */
export default async function FishPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/fish')
  const userId = session.user.id

  const [species, prefs, locations] = await Promise.all([
    internalApiFetch<FishSummary[]>('/v1/species').catch(() => [] as FishSummary[]),
    internalApiFetch<Preferences>('/v1/me/preferences', { userId }).catch(() => null),
    internalApiFetch<{ id: string; conditions_region: string; timezone?: string }[]>('/v1/locations').catch(() => []),
  ])
  const home = locations.find((spot) => spot.id === prefs?.default_location_id)
  // The month where the angler is, not on the (UTC) server.
  const month = monthIn(home?.timezone)

  return (
    <main>
      <Container>
        <div className="flex flex-col gap-6 py-10 pb-16 sm:py-14">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Fish guide</h1>
            <p className="mt-3 max-w-2xl text-text-muted">
              Every fish Saltline knows: where it lives, when it bites, and how to catch it.
            </p>
          </header>
          <FishGuide
            // Just each photo's URL: the full credits manifest stays on the server.
            species={species.map((fish) => toGuideFish(fish, SPECIES_PHOTOS[fish.id]?.src ?? null))}
            initialRegion={home?.conditions_region ?? null}
            month={month}
            favorites={prefs?.favorite_species ?? []}
            units={prefs?.units ?? 'imperial'}
          />
        </div>
      </Container>
    </main>
  )
}
