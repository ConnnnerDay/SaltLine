'use client'

import { tempBand, type Units } from '@/lib/units'

import type { CatchEntry } from '@/app/api/catches/route'
import { Card } from '@/app/components/ui'

/**
 * "Your patterns": the catch log read back as a picture of when and in
 * what conditions this angler actually catches fish. Everything comes
 * from the catches themselves -- the time each was logged and the
 * forecast snapshot apps/api saved with it (water temperature, tide
 * direction, moon phase, solunar period). Older catches without a field
 * are simply left out of that one chart, never guessed.
 *
 * Each chart is a single-series bar list (one color, value at the end of
 * the bar), and the headline sentence only states a pattern when at
 * least `MIN_FOR_PATTERN` catches support it.
 */

const MIN_FOR_PATTERN = 3

type Bucket = { label: string; count: number }

const TIME_BUCKETS: { label: string; hours: number[] }[] = [
  { label: 'Dawn', hours: [5, 6, 7] },
  { label: 'Morning', hours: [8, 9, 10, 11] },
  { label: 'Afternoon', hours: [12, 13, 14, 15, 16] },
  { label: 'Evening', hours: [17, 18, 19, 20] },
  { label: 'Night', hours: [21, 22, 23, 0, 1, 2, 3, 4] },
]

const WHEN_PHRASE: Record<string, string> = {
  Dawn: 'at dawn',
  Morning: 'in the morning',
  Afternoon: 'in the afternoon',
  Evening: 'in the evening',
  Night: 'at night',
}

const MOON_ORDER = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
]

function count<T>(items: T[], keyOf: (item: T) => string | null, order?: string[]): Bucket[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyOf(item)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const buckets = [...counts.entries()].map(([label, value]) => ({ label, count: value }))
  return order
    ? order.map((label) => ({ label, count: counts.get(label) ?? 0 })).filter((b) => b.count > 0)
    : buckets.sort((a, b) => b.count - a.count)
}

function timeOfDay(entry: CatchEntry): string {
  // The hour at the spot, not on the viewer's (or server's) clock.
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      ...(entry.timezone ? { timeZone: entry.timezone } : {}),
    }).format(new Date(entry.caught_at)),
  )
  return TIME_BUCKETS.find((bucket) => bucket.hours.includes(hour))?.label ?? 'Night'
}

function waterBand(entry: CatchEntry, units: Units): string | null {
  const temp = entry.conditions?.water_temp_f
  if (temp == null || entry.conditions?.water_temp_is_fallback) return null
  return tempBand(temp, units).label
}

/** The most common bucket, if it has enough catches to call a pattern. */
function top(buckets: Bucket[]): Bucket | null {
  const best = [...buckets].sort((a, b) => b.count - a.count)[0]
  return best && best.count >= MIN_FOR_PATTERN ? best : null
}

function Bars({ title, buckets, total }: { title: string; buckets: Bucket[]; total: number }) {
  if (buckets.length === 0) return null
  const max = Math.max(...buckets.map((bucket) => bucket.count))
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold text-text">
        {title}
        <span className="text-xs font-normal text-text-muted">{total} with data</span>
      </h3>
      <ul className="flex flex-col gap-1.5">
        {buckets.map((bucket) => (
          <li key={bucket.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
            <span className="truncate text-text-muted">{bucket.label}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-3 rounded-r-[4px] bg-primary"
                style={{ width: `${Math.max(4, (bucket.count / max) * 100)}%` }}
                aria-hidden="true"
              />
              <span className="shrink-0 text-xs font-semibold tabular-nums text-text">
                {bucket.count}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-raised px-4 py-3">
      <span className="section-label">{label}</span>
      <span className="text-xl font-bold text-text">{value}</span>
    </div>
  )
}

export function CatchInsights({ catches, units = 'imperial' }: { catches: CatchEntry[]; units?: Units }) {
  if (catches.length < 2) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="section-label">Your patterns</h2>
        <p className="text-sm text-text-muted">
          Log a few catches and this turns into a picture of when you catch fish: time of day,
          tide, moon, water temperature and species.
        </p>
      </Card>
    )
  }

  const withTide = catches.filter((entry) => entry.conditions?.tide)
  const withMoon = catches.filter((entry) => entry.conditions?.moon_phase)
  // Catches whose snapshot was taken with solunar data (moon_phase is
  // recorded alongside it); solunar itself is null outside both periods.
  const withSolunar = catches.filter((entry) => entry.conditions?.moon_phase)
  const withWater = catches.filter((entry) => waterBand(entry, units))

  const times = count(catches, timeOfDay, TIME_BUCKETS.map((bucket) => bucket.label))
  const tides = count(
    withTide,
    (entry) => (entry.conditions?.tide === 'incoming' ? 'Incoming' : 'Outgoing'),
    ['Incoming', 'Outgoing'],
  )
  const solunar = count(
    withSolunar,
    (entry) =>
      entry.conditions?.solunar === 'major'
        ? 'Major period'
        : entry.conditions?.solunar === 'minor'
          ? 'Minor period'
          : 'Outside both',
    ['Major period', 'Minor period', 'Outside both'],
  )
  const water = count(withWater, (entry) => waterBand(entry, units)).sort((a, b) => parseInt(a.label) - parseInt(b.label))
  const moons = count(withMoon, (entry) => entry.conditions?.moon_phase ?? null, MOON_ORDER)
  const species = count(catches, (entry) => entry.species).slice(0, 6)

  const biggest = catches
    .filter((entry) => entry.length_in !== null)
    .sort((a, b) => (b.length_in ?? 0) - (a.length_in ?? 0))[0]
  const released = catches.filter((entry) => !entry.kept).length

  const pattern = [
    top(times) && WHEN_PHRASE[top(times)!.label],
    top(tides) && `on an ${top(tides)!.label.toLowerCase()} tide`,
    top(water) && `with water at ${top(water)!.label}`,
  ].filter(Boolean)

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="section-label">Your patterns</h2>

      {pattern.length > 0 && (
        <p className="rounded-md border-l-4 border-l-primary bg-primary-tint px-3 py-2 text-sm text-text">
          <span className="font-semibold">So far: </span>
          most of your fish came {pattern.join(', ')}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Catches" value={`${catches.length}`} />
        <Stat label="Species" value={`${new Set(catches.map((entry) => entry.species)).size}`} />
        <Stat label="Released" value={`${Math.round((released / catches.length) * 100)}%`} />
        <Stat label="Biggest" value={biggest ? `${biggest.length_in} in` : '—'} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Bars title="Time of day" buckets={times} total={catches.length} />
        <Bars title="Tide" buckets={tides} total={withTide.length} />
        <Bars title="Solunar" buckets={solunar} total={withSolunar.length} />
        <Bars title="Water temperature" buckets={water} total={withWater.length} />
        <Bars title="Moon" buckets={moons} total={withMoon.length} />
        <Bars title="Species" buckets={species} total={catches.length} />
      </div>
    </Card>
  )
}
