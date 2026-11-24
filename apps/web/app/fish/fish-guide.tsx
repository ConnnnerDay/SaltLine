'use client'

import { pickWarning } from '@/lib/fish-id'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { cx } from '@/app/components/ui/cx'
import { ACCESS_LABEL, MONTH_NAMES, REGION_LABEL, REGIONS, seasonOf, spawningIn, type FishSummary } from '@/lib/fish'
import { BaitThisMonth } from './bait-this-month'
import { temp, type Units } from '@/lib/units'

type GuideFish = FishSummary & { photo: string | null }

const PAGE = 48
const SEASONS = [
  { key: 'all', label: 'Any time' },
  { key: 'now', label: 'In season now' },
  { key: 'peak', label: 'Peak now' },
  { key: 'spawn', label: 'Spawning now' },
] as const
const ACCESS_ORDER: FishSummary['access'][] = ['shore', 'boat', 'tidal', 'incidental', 'protected']
const SEASON_RANK = { peak: 0, good: 1, off: 2 }

const CHIP =
  'rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
const chip = (on: boolean) =>
  cx(CHIP, on ? 'border-primary bg-primary text-primary-contrast' : 'border-border text-text-muted hover:border-primary hover:text-text')

/** The Fish guide's searchable, filterable list (see ./page.tsx). */
export function FishGuide({
  species,
  initialRegion,
  month,
  units,
  favorites = [],
}: {
  favorites?: string[]
  species: GuideFish[]
  initialRegion: string | null
  month: number
  units: Units
}) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<string>(initialRegion ?? 'all')
  const [season, setSeason] = useState<(typeof SEASONS)[number]['key']>('all')
  const [kinds, setKinds] = useState<FishSummary['access'][]>(['shore', 'boat', 'tidal'])
  const [shown, setShown] = useState(PAGE)
  const [mineOnly, setMineOnly] = useState(false)
  const mine = useMemo(() => new Set(favorites), [favorites])

  const order = useMemo(() => new Map(species.map((fish, index) => [fish.id, index])), [species])
  // Seasons differ by coast; with a region picked, use that region's months.
  const regionKey = region === 'all' ? null : region
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return species
      .filter((fish) => !mineOnly || mine.has(fish.id))
      .filter((fish) => mineOnly || region === 'all' || fish.regions.includes(region))
      .filter((fish) => kinds.includes(fish.access))
      .filter((fish) => !q || fish.name.toLowerCase().includes(q))
      .filter((fish) => {
        const now = seasonOf(fish, month, regionKey)
        if (season === 'spawn') return spawningIn(fish, month)
        return season === 'all' || (season === 'peak' ? now === 'peak' : now !== 'off')
      })
      // In season first; within that, catalogue order (the commonly
      // targeted shore fish lead), not the alphabet.
      .sort(
        (a, b) =>
          SEASON_RANK[seasonOf(a, month, regionKey)] - SEASON_RANK[seasonOf(b, month, regionKey)] ||
          order.get(a.id)! - order.get(b.id)!,
      )
  }, [species, order, query, region, season, kinds, month, mineOnly, mine])

  function toggleKind(kind: FishSummary['access']) {
    setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]))
    setShown(PAGE)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5">
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Search fish</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setShown(PAGE)
            }}
            placeholder={`Search ${species.length} fish, e.g. "flounder"`}
            className="rounded-md border border-border bg-bg px-3 py-2.5 text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Region">
          <button
            type="button"
            aria-pressed={mineOnly}
            onClick={() => {
              setMineOnly((value) => !value)
              setShown(PAGE)
            }}
            className={cx(chip(mineOnly), 'mr-2 inline-flex items-center gap-1')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" />
            </svg>
            My fish ({favorites.length})
          </button>
          <span className="mr-1 text-xs font-semibold text-text-muted">Region</span>
          {[{ key: 'all', label: 'All' }, ...REGIONS].map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={region === option.key}
              onClick={() => {
                setRegion(option.key)
                setShown(PAGE)
              }}
              className={chip(region === option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Season">
            <span className="mr-1 text-xs font-semibold text-text-muted">{MONTH_NAMES[month - 1]}</span>
            {SEASONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={season === option.key}
                onClick={() => {
                  setSeason(option.key)
                  setShown(PAGE)
                }}
                className={chip(season === option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kind of fishing">
            <span className="mr-1 text-xs font-semibold text-text-muted">Show</span>
            {ACCESS_ORDER.map((kind) => (
              <button key={kind} type="button" aria-pressed={kinds.includes(kind)} onClick={() => toggleKind(kind)} className={chip(kinds.includes(kind))}>
                {ACCESS_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <BaitThisMonth
        region={mineOnly ? 'all' : region}
        month={month}
        units={units}
        fish={species.map((fish) => ({ name: fish.name, regions: fish.regions }))}
      />

      <p className="text-sm text-text-muted" aria-live="polite">
        {results.length} fish{mineOnly ? ' in My fish' : region !== 'all' && ` in the ${REGION_LABEL[region]}`}
        {season === 'spawn'
          ? ', spawning now'
          : season !== 'all' && (season === 'peak' ? ', at their peak now' : ', in season now')}
      </p>

      {results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
          {mineOnly
            ? 'No fish in My fish yet. Open any fish and tap “Add to My fish”.'
            : 'No fish match. Try another region, or clear the search.'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.slice(0, shown).map((fish) => {
            const now = seasonOf(fish, month, regionKey)
            return (
              <li key={fish.id}>
                <Link
                  href={`/fish/${encodeURIComponent(fish.id)}`}
                  className="flex h-full gap-3 rounded-lg border border-border bg-surface p-3 text-text no-underline shadow-card transition-colors hover:border-primary"
                >
                  <span className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md bg-bg">
                    {fish.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fish.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <svg viewBox="0 0 64 40" aria-hidden="true" className="h-full w-full p-4 text-text-muted/40">
                        <path d="M6 20c8-10 26-12 40-4l10-7v22l-10-7C32 32 14 30 6 20z" fill="currentColor" />
                      </svg>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span data-fish-name className="font-bold leading-snug">
                      {fish.name}
                      {mine.has(fish.id) && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="ml-1.5 inline text-accent" role="img" aria-label="In My fish">
                          <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" />
                        </svg>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 font-bold',
                          now === 'peak' && 'bg-accent-tint text-accent',
                          now === 'good' && 'bg-primary-tint text-primary',
                          now === 'off' && 'bg-border text-text-muted',
                        )}
                      >
                        {now === 'peak' ? 'Peak now' : now === 'good' ? 'In season' : 'Off season'}
                      </span>
                      {spawningIn(fish, month) && (
                        <span className="rounded-full bg-marginal-bg px-2 py-0.5 font-bold text-marginal-text">Spawning</span>
                      )}
                      {fish.access !== 'shore' && <span className="text-text-muted">{ACCESS_LABEL[fish.access]}</span>}
                      {pickWarning(fish.id) && <span className="font-semibold text-nogo-text">⚠ {pickWarning(fish.id)}</span>}
                    </span>
                    <span className="text-xs text-text-muted">
                      {temp(fish.temp_ideal_low, units)}–{temp(fish.temp_ideal_high, units)} water ·{' '}
                      {fish.regions.map((key) => REGION_LABEL[key] ?? key).join(', ')}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {results.length > shown && (
        <button
          type="button"
          onClick={() => setShown((count) => count + PAGE)}
          className="self-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Show more ({results.length - shown} left)
        </button>
      )}
    </div>
  )
}
