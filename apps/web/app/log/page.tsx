import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Container } from '@/app/components/ui'
import type { CatchEntry } from '@/app/api/catches/route'
import type { SavedLocation } from '@/app/api/saved-locations/route'
import { auth } from '@/lib/auth'
import { homeLocationId } from '@/lib/home-location'
import { internalApiFetch } from '@/lib/internal-api-client'
import { CatchLog, type LocationOption } from './catch-log'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Catch log' }

type Props = { searchParams: Promise<{ location?: string }> }

/**
 * The restored catch log: log what you caught (species, size, kept or
 * released, bait, notes) at one of your spots, with the conditions at
 * that spot captured automatically, and see your log newest first.
 * Spot choices list your home and saved spots first, then every curated
 * spot; `?location=` (from a forecast page's "Log a catch") preselects one.
 */
export default async function LogPage({ searchParams }: Props) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/log')
  const userId = session.user.id
  const { location } = await searchParams

  let catches: CatchEntry[] | null = null
  let error: string | null = null
  try {
    catches = await internalApiFetch<CatchEntry[]>('/v1/me/catches', { userId })
  } catch {
    error = 'Could not load your catch log.'
  }

  const [saved, curated, species, home] = await Promise.all([
    internalApiFetch<SavedLocation[]>('/v1/me/locations', { userId }).catch(() => []),
    internalApiFetch<{ id: string; name: string; state: string }[]>('/v1/locations').catch(
      () => [],
    ),
    internalApiFetch<string[]>('/v1/me/catches/species', { userId }).catch(() => []),
    homeLocationId(userId),
  ])

  const names = new Map<string, string>()
  for (const spot of curated) names.set(spot.id, `${spot.name}, ${spot.state}`)
  for (const spot of saved) names.set(spot.location_id, `${spot.name}, ${spot.state}`)

  const mine: LocationOption[] = []
  for (const id of [location, home, ...saved.map((spot) => spot.location_id)]) {
    if (id && !mine.some((option) => option.id === id)) {
      mine.push({ id, label: names.get(id) ?? 'Custom spot' })
    }
  }
  const others: LocationOption[] = curated
    .filter((spot) => !mine.some((option) => option.id === spot.id))
    .map((spot) => ({ id: spot.id, label: `${spot.name}, ${spot.state}` }))

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10 sm:py-14">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Catch log</h1>
            <p className="mt-3 text-text-muted">
              Log what you caught. The conditions at that spot are saved with it.
            </p>
          </header>
          <CatchLog
            initialCatches={catches}
            initialError={error}
            mySpots={mine}
            otherSpots={others}
            speciesOptions={species}
            defaultLocationId={mine[0]?.id ?? others[0]?.id ?? ''}
          />
        </div>
      </Container>
    </main>
  )
}
