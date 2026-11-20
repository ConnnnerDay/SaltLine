'use client'

import { HookIt } from '@/app/components/hook-it'
import { hooksFor } from '@/lib/hook-bait'
import { useState } from 'react'
import baitData from '@/lib/baits.json'
import { cx } from '@/app/components/ui/cx'
import { MONTH_NAMES, REGION_LABEL, monthSpan } from '@/lib/fish'
import { localizeText, type Units } from '@/lib/units'

type Bait = {
  name: string
  kind: 'shop' | 'natural'
  coast: 'east' | 'west' | 'hawaii' | 'all'
  months: number[]
  note: string
  seasonal_notes: { months: number[]; note: string }[]
  targets: string[]
}

// Lures and trolling tackle (shad darts, cedar plugs) aren't bait.
const BAITS = (baitData as { baits: Bait[] }).baits.filter((bait) => !/\bdarts?\b|\bjigs?\b|\bplugs?\b|feathers?/i.test(bait.name))

/** The bait's name without its parenthetical, for matching a "catch your
 * own" entry to the bait-shop entry for the same bait. */
const core = (name: string) => name.replace(/\s*\(.*\)/, '').trim().toLowerCase()

function coastOf(region: string): Bait['coast'] | 'any' {
  if (region.startsWith('atlantic') || region === 'gulf') return 'east'
  if (region.startsWith('pacific')) return 'west'
  if (region.startsWith('hawaii')) return 'hawaii'
  return 'any'
}

/**
 * "Bait this month" in the Fish guide: the legacy bait tables
 * (lib/baits.json -- tackle-shop baits with their seasonal notes and target
 * fish, and natural baits you catch or gather), for the region picked in
 * the guide and the current month. What's in season comes first; the rest
 * is one tap away with the months it's around.
 */
export function BaitThisMonth({
  region,
  month,
  units,
  fish = [],
}: {
  region: string
  month: number
  units: Units
  /** The catalogue's fish, to keep a region's list to baits for fish
   * that live there (the bait tables cover a whole coast). */
  fish?: { name: string; regions: string[] }[]
}) {
  const coast = coastOf(region)
  // A bait's target fish that live in the picked region. A target the
  // catalogue doesn't know is kept rather than guessed away.
  const targetsHere = (bait: Bait) =>
    region === 'all'
      ? bait.targets
      : bait.targets.filter((target) => {
          const known = fish.filter((entry) => entry.name.toLowerCase().includes(target.toLowerCase()))
          return known.length === 0 || known.some((entry) => entry.regions.includes(region))
        })
  const here = BAITS.filter(
    (bait) =>
      (coast === 'any' || bait.coast === coast || bait.coast === 'all') &&
      (bait.targets.length === 0 || targetsHere(bait).length > 0),
  )
  // A "catch or gather" bait that's also sold (Mullet / Cut mullet) is
  // one entry: the shop one, with how to get your own as a second line.
  const shopNames = here.filter((bait) => bait.kind === 'shop').map((bait) => bait.name.toLowerCase())
  // The closest match wins ("Live finger mullet" takes "Finger mullet",
  // not "Mullet"); a note that only says to buy it adds nothing.
  const gatherFor = (bait: Bait) =>
    here
      .filter(
        (other) =>
          other.kind === 'natural' &&
          other.months.includes(month) &&
          bait.name.toLowerCase().includes(core(other.name)) &&
          !/bait shops?/i.test(noteFor(other)),
      )
      .sort((x, y) => core(y.name).length - core(x.name).length)[0]
  const merged = here.filter(
    (bait) => bait.kind === 'shop' || !shopNames.some((name) => name.includes(core(bait.name))),
  )
  const inSeason = merged.filter((bait) => bait.months.includes(month))
  const later = merged.filter((bait) => !bait.months.includes(month))
  const say = (text: string) => localizeText(text, units)
  const [showAll, setShowAll] = useState(false)
  // Shop and natural baits interleaved, so the first few show both kinds.
  const shop = inSeason.filter((bait) => bait.kind === 'shop')
  const natural = inSeason.filter((bait) => bait.kind === 'natural')
  const mixed = Array.from({ length: Math.max(shop.length, natural.length) }, (_, i) => [shop[i], natural[i]])
    .flat()
    .filter((bait): bait is Bait => Boolean(bait))
  const shown = showAll ? mixed : mixed.slice(0, 6)

  const noteFor = (bait: Bait) =>
    bait.seasonal_notes.find((seasonal) => seasonal.months.includes(month))?.note ?? bait.note

  return (
    <details className="group rounded-lg border border-border bg-surface shadow-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="section-label text-text!">Bait this month</span>
          <span className="text-xs text-text-muted">
            {inSeason.length} in season for {MONTH_NAMES[month - 1]}
            {region !== 'all' && REGION_LABEL[region] ? ` · ${REGION_LABEL[region]}` : ''}
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-text-muted transition-transform group-open:rotate-180">
          <path d="M6 9 L12 15 L18 9" />
        </svg>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:px-5">
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {shown.map((bait) => (
            <li key={`${bait.kind}-${bait.name}`} className="flex flex-col gap-1 rounded-md border border-border bg-surface-raised px-3 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text">{bait.name}</span>
                <span
                  className={cx(
                    'rounded-full px-2 py-0.5 text-[0.6875rem] font-bold',
                    bait.kind === 'shop' ? 'bg-primary-tint text-primary' : 'bg-go-bg text-go-text',
                  )}
                >
                  {bait.kind === 'shop' ? 'Bait shop' : 'Catch or gather'}
                </span>
              </span>
              <span className="text-xs leading-relaxed text-text-muted">{say(noteFor(bait))}</span>
              {bait.kind === 'shop' && gatherFor(bait) && (
                <span className="text-xs leading-relaxed text-text-muted">
                  <span className="font-semibold text-go-text">Or catch your own: </span>
                  {say(noteFor(gatherFor(bait)!))}
                </span>
              )}
              {hooksFor(bait.name).length > 0 && (
                <div className="text-xs">
                  <HookIt hows={hooksFor(bait.name)} say={say} />
                </div>
              )}
              {targetsHere(bait).length > 0 && (
                <span className="text-xs text-text">
                  <span className="text-text-muted">For: </span>
                  {targetsHere(bait).join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
        {mixed.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="w-fit text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {showAll ? 'Show fewer' : `Show all ${mixed.length} in season`}
          </button>
        )}
        {later.length > 0 && (
          <details className="text-sm">
            <summary className="w-fit cursor-pointer font-semibold text-primary">
              Out of season now ({later.length})
            </summary>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {later.map((bait) => (
                <li key={`${bait.kind}-${bait.name}`} className="rounded-full border border-border px-2.5 py-1 text-xs text-text-muted">
                  {bait.name} · {monthSpan(bait.months)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  )
}
