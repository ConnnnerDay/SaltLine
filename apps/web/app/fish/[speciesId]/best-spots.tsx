import Link from 'next/link'
import { Card } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import { internalApiFetch } from '@/lib/internal-api-client'
import { localizeText, temp, type Units } from '@/lib/units'

type SpotForSpecies = {
  location_id: string
  label: string
  biting: boolean
  score: number | null
  tier: 'prime' | 'good' | 'fair' | null
  reasons: string[]
  water_temp_f: number | null
  day_verdict: string | null
}

const TIER_PILL: Record<string, string> = {
  prime: 'bg-accent-tint text-accent',
  good: 'bg-primary-tint text-primary',
  fair: 'bg-border text-text',
}

/**
 * "Best of your spots today" on a fish's page: the user's home and saved
 * spots ranked for this one fish (apps/api `/v1/species/{id}/spots`, each
 * spot's current forecast scored exactly as "What's biting" scores it).
 * Streams in under a Suspense boundary -- spots whose forecasts aren't
 * cached yet take a moment to assemble.
 */
export async function BestSpots({
  speciesId,
  name,
  spotIds,
  units,
}: {
  speciesId: string
  name: string
  spotIds: string[]
  units: Units
}) {
  if (spotIds.length === 0) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="section-label">Best of your spots today</h2>
        <p className="text-sm text-text-muted">
          Save a few spots (or set a home spot) and this shows where {name.toLowerCase()} are biting best among them
          today.
        </p>
      </Card>
    )
  }
  const query = spotIds.map((id) => `ids=${encodeURIComponent(id)}`).join('&')
  const spots = await internalApiFetch<SpotForSpecies[]>(
    `/v1/species/${encodeURIComponent(speciesId)}/spots?${query}`,
  ).catch(() => null)
  if (!spots || spots.length === 0) return null
  const biting = spots.filter((spot) => spot.biting)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-label">Best of your spots today</h2>
        <span className="text-xs text-text-muted">Your home and saved spots, scored for {name.toLowerCase()}</span>
      </div>
      {biting.length === 0 && (
        <p className="text-sm text-text-muted">Not biting at any of your spots today.</p>
      )}
      <ol className="flex flex-col gap-2">
        {spots.map((spot, index) => (
          <li key={spot.location_id}>
            <Link
              href={`/forecast/${encodeURIComponent(spot.location_id)}#fish`}
              className={cx(
                'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5 text-sm no-underline hover:border-primary',
                spot.biting ? 'border-border bg-surface-raised' : 'border-dashed border-border opacity-75',
              )}
            >
              {spot.biting && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-border text-xs font-bold tabular-nums text-text">
                  {index + 1}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-text">{localizeText(spot.label, units)}</span>
                <span className="block text-xs text-text-muted">
                  {spot.biting
                    ? localizeText(spot.reasons.slice(0, 2).join(' · '), units)
                    : 'Not biting here today'}
                  {!spot.biting && spot.water_temp_f !== null && ` · water ${temp(spot.water_temp_f, units)}`}
                  {spot.day_verdict && ` · day: ${spot.day_verdict.toLowerCase()}`}
                </span>
              </span>
              {spot.biting && spot.tier && (
                <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold uppercase', TIER_PILL[spot.tier])}>
                  {spot.tier}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}
