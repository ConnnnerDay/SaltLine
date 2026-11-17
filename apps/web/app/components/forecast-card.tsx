import { Badge, type BadgeVariant, Button, Card } from './ui'
import { cx } from './ui/cx'
import { HourlyChart } from './hourly-chart'
import { RigDiagram } from './rig-diagram'
import { RIGS, rigsFor, type RigId } from '@/lib/rigs'
import { RIG_FIT, RIG_WATER_TIPS, WATER_NOUN, WATER_PHRASE, watersFor } from '@/lib/fishing-style'
import type { Preferences } from '@/app/api/preferences/route'
import { WhereToFish, YourDay } from './your-day'
import { SunAndMoon, WeatherAlerts, type SkyConditions } from './sky'
import { currentTime } from '@/lib/clock'
import type { NearbyCam } from '@/lib/get-cams'
import speciesPhotos from '@/lib/species-photos.json'

export type ForecastVerdict = 'Excellent' | 'Good' | 'Fair' | 'Challenging' | 'Poor' | 'Unknown'

export type TidePrediction = {
  time: string
  kind: 'high' | 'low'
  height_ft: number
}

export type ForecastTides = {
  station_id: string
  predictions: TidePrediction[]
}

export type SourceStatus = {
  provider: string
  state: 'ok' | 'degraded' | 'unavailable'
  as_of: string
  detail?: string | null
}

export type ActivityTag = 'low' | 'med' | 'high' | 'prime'

export type HourlyActivity = {
  hour: number
  time: string
  level: number
  tag: ActivityTag
  is_now: boolean
  peak: boolean
  reasons: string[]
  sun_event: 'sunrise' | 'sunset' | null
  tide_event: 'high' | 'low' | null
  tide_time: string | null
  feeding: 'major' | 'minor' | null
}

/** apps/api's personalized "your window": the best stretch inside the
 * signed-in user's usual fishing times (and preferred tide). */
export type YourWindow = {
  start: string
  end: string
  tag: HourlyActivity['tag']
  reasons: string[]
}

export type HourlyOutlook = {
  hours: HourlyActivity[]
  your_window?: YourWindow | null
}

export type Observation = {
  value: number
  unit: string
  is_fallback: boolean
}

export type GuidanceTier = 'prime' | 'good' | 'fair'

export type Regulation = {
  state: string
  min_size: string | null
  bag_limit: string | null
  season: string | null
  notes: string | null
  source_url: string | null
  as_of: string
  possibly_outdated: boolean
}

export type SpeciesPick = {
  id: string
  name: string
  score: number
  tier: GuidanceTier
  reasons: string[]
  explanation: string
  bait: string
  rig: string
  hook_size: string
  sinker: string
  lures: string
  regulation?: Regulation | null
  targets?: string[]
  matches_profile?: boolean
}

/** Sprint 35's `app.domain.guidance.FishingGuidance`. */
export type FishingGuidance = {
  basis: {
    water_temp_f: number
    water_temp_is_fallback: boolean
    month: number
    region: string
  }
  species: SpeciesPick[]
  tackle_note: string | null
  /** The original "Pack for today" card; absent on older envelopes. */
  pack?: { headline: string; rows: { kind: string; label: string; value: string }[] } | null
  /** 12 levels per species, January first; absent on older envelopes. */
  calendar?: { id: string; name: string; months: ('peak' | 'good' | '')[] }[]
  disclaimer: string
}

export type ForecastEnvelope = {
  location: { id: string; label: string; timezone: string }
  generated_at: string
  state: 'fresh' | 'stale' | 'partial' | 'unavailable'
  sources: SourceStatus[]
  confidence: { level: string; reasons: string[] }
  warnings: { code: string; message: string; severity: string }[]
  conditions: {
    score?: {
      score: number | null
      verdict: ForecastVerdict
      summary: string
      /** Set when the signed-in user's comfort limits downgraded the verdict. */
      personalized_from?: ForecastVerdict
    } | null
    /** Set when the day exceeds the signed-in user's comfort limits. */
    comfort?: { over_limit: boolean; reasons: string[] } | null
    water_temperature: Observation
    wind_range_kt: [number, number] | null
    wave_range_ft: [number, number] | null
    wind_direction: string | null
  } | null
  tides: ForecastTides | null
  hourly_outlook: HourlyOutlook | null
  recommendations?: FishingGuidance | null
}

export const VERDICT_TO_BADGE: Record<ForecastVerdict, BadgeVariant> = {
  Excellent: 'go',
  Good: 'go',
  Fair: 'marginal',
  Challenging: 'marginal',
  Poor: 'nogo',
  Unknown: 'neutral',
}

const FORECAST_STATE_TO_BADGE: Record<ForecastEnvelope['state'], BadgeVariant> = {
  fresh: 'go',
  stale: 'marginal',
  partial: 'marginal',
  unavailable: 'nogo',
}

const SOURCE_STATE_TO_BADGE: Record<SourceStatus['state'], BadgeVariant> = {
  ok: 'go',
  degraded: 'marginal',
  unavailable: 'nogo',
}

const PROVIDER_LABELS: Record<string, string> = {
  'nws:marine_zone': 'NWS marine zone',
  'noaa_coops:water_temperature': 'Water temperature',
  'ndbc:buoy': 'NDBC buoy',
  'noaa_coops:tides': 'Tide predictions',
  'noaa_coops:wind': 'CO-OPS wind (fallback)',
  'nws:gridpoint_wind': 'NWS gridpoint wind (fallback)',
}

function providerLabel(provider: string): string {
  return (
    PROVIDER_LABELS[provider] ??
    provider
      .replace(/[_:]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Sprint 33's "full/partial/stale/unavailable source-attributed
 * snapshots" -- each source apps/api fanned out to (marine zone, water
 * temperature, buoy, tides, and the wind-fallback chain when it fires)
 * shown individually, not just folded into the aggregate `state`/
 * `warnings` already rendered above. `detail` (a raw provider error
 * string) is shown only for non-ok sources, since it's the honest
 * "why" behind a degraded/unavailable badge.
 */
function SourceStatusList({ sources }: { sources: SourceStatus[] }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {sources.map((source) => (
          <li key={source.provider} className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-text">{providerLabel(source.provider)}</span>
              <Badge variant={SOURCE_STATE_TO_BADGE[source.state]}>
                {capitalize(source.state)}
              </Badge>
            </div>
            {source.state !== 'ok' && source.detail && (
              <p className="break-words text-text-muted">{source.detail}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TideChart({ tides, timezone }: { tides: ForecastTides; timezone: string }) {
  // The chart covers the next ~24 hours (the table lists every
  // prediction): three days of zigzag is too dense to read.
  const firstTime = tides.predictions.length
    ? new Date(tides.predictions[0].time).getTime()
    : 0
  const points = tides.predictions.filter(
    (prediction) => new Date(prediction.time).getTime() - firstTime <= 26 * 3600 * 1000,
  )
  if (points.length < 2) return null

  const times = points.map((p) => new Date(p.time).getTime())
  const heights = points.map((p) => p.height_ft)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const minHeight = Math.min(...heights)
  const maxHeight = Math.max(...heights)
  const timeSpan = maxTime - minTime || 1
  const heightSpan = maxHeight - minHeight || 1

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

  // Positions in percent of the plot box: x inset 6% each side so edge
  // labels fit; y keeps 22% headroom above highs and 26% below lows for
  // their labels.
  const coords = points.map((prediction, index) => ({
    prediction,
    x: 6 + ((times[index] - minTime) / timeSpan) * 88,
    y: 22 + (1 - (prediction.height_ft - minHeight) / heightSpan) * 52,
  }))
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const area = `${line} L ${coords[coords.length - 1].x} 100 L ${coords[0].x} 100 Z`

  return (
    <div aria-hidden="true" className="relative h-40 sm:h-44">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="presentation"
        className="absolute inset-0 h-full w-full"
      >
        <path d={area} className="fill-primary opacity-10" />
        <path
          d={line}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-primary"
        />
      </svg>
      {coords.map(({ prediction, x, y }) => {
        const high = prediction.kind === 'high'
        return (
          <div
            key={prediction.time}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="absolute h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface" />
            <span
              className={cx(
                'absolute whitespace-nowrap text-center text-xs leading-tight tabular-nums',
                high ? 'bottom-2' : 'top-2',
              )}
            >
              <span className="block font-bold text-text">
                {high ? 'High' : 'Low'} {prediction.height_ft.toFixed(1)} ft
              </span>
              <span className="block text-text-muted">
                {timeFormatter.format(new Date(prediction.time))}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Sprint 34's tide table -- the text-alternative half of that sprint's
 * "accessible charts, text alternatives" acceptance bar, rendered
 * alongside `TideChart` above (the real accessible representation --
 * the chart is `aria-hidden`). A plain, properly-labeled `<table>` is
 * itself an accessible representation, not a fallback for one. Times
 * are formatted in the *location's* timezone
 * (`forecast.location.timezone`), not the viewer's browser timezone --
 * a tide time is only meaningful relative to the place it's for.
 */
function TideTable({
  tides,
  timezone,
}: {
  tides: ForecastTides
  timezone: string
}) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm sm:w-auto">
          <caption className="sr-only">
            Upcoming high and low tides for {tides.station_id}
          </caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="py-1 pr-4 font-medium sm:pr-12">
                Time
              </th>
              <th scope="col" className="py-1 pr-4 font-medium sm:pr-12">
                Tide
              </th>
              <th scope="col" className="py-1 font-medium">
                Height
              </th>
            </tr>
          </thead>
          <tbody>
            {tides.predictions.map((prediction) => (
              <tr key={prediction.time} className="border-t border-border">
                <td className="py-1.5 pr-4 text-text sm:pr-12">
                  {formatter.format(new Date(prediction.time))}
                </td>
                <td className="py-1.5 pr-4 text-text sm:pr-12">
                  {prediction.kind === 'high' ? 'High' : 'Low'}
                </td>
                <td className="py-1.5 text-text">{prediction.height_ft.toFixed(1)} ft</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const ACTIVITY_BAR: Record<ActivityTag, string> = {
  prime: 'bg-tier-prime',
  high: 'bg-tier-high',
  med: 'bg-tier-med',
  low: 'bg-tier-low',
}

const ACTIVITY_LABEL: Record<ActivityTag, string> = {
  prime: 'Prime',
  high: 'High',
  med: 'Good',
  low: 'Low',
}

/**
 * Sprint 34's hourly outlook table -- the "text alternatives" half of
 * the acceptance bar (apps/api's `app.domain.timing.
 * build_hourly_outlook`, backend), rendered alongside
 * `HourlyChart` (hourly-chart.tsx) as the real accessible representation
 * (the chart is `aria-hidden`). A plain, properly-labeled `<table>` is
 * itself an accessible representation, not a fallback for one.
 * `hour.reasons`/`tide_event` are apps/api's own plain-language "why"
 * for that hour's estimate, shown verbatim rather than re-derived here.
 */
function HourlyOutlookTable({
  outlook,
  timezone,
}: {
  outlook: HourlyOutlook
  timezone: string
}) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Estimated hourly fish-activity level, today, in {timezone}
          </caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="py-1 pr-4 font-medium">
                Time
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Activity
              </th>
              <th scope="col" className="py-1 font-medium">
                Why
              </th>
            </tr>
          </thead>
          <tbody>
            {outlook.hours.map((hour) => {
              // reasons can already name the tide event; list each once.
              const why = Array.from(
                new Set(
                  [
                    ...hour.reasons,
                    hour.tide_event ? `${capitalize(hour.tide_event)} tide` : null,
                  ].filter((part): part is string => Boolean(part)),
                ),
              ).join(' · ')
              return (
                <tr
                  key={hour.hour}
                  className={cx('border-t border-border', hour.is_now && 'bg-primary/10')}
                >
                  <td className="py-1.5 pr-4 whitespace-nowrap text-text">
                    {formatter.format(new Date(hour.time))}
                    {hour.is_now && <span className="text-text-muted"> (now)</span>}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2.5 whitespace-nowrap">
                      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-border sm:w-24">
                        <span
                          className={cx('block h-full rounded-full', ACTIVITY_BAR[hour.tag])}
                          style={{ width: `${Math.max(4, hour.level)}%` }}
                        />
                      </span>
                      <span className="font-semibold text-text">
                        {ACTIVITY_LABEL[hour.tag]}
                      </span>
                      <span className="text-text-muted tabular-nums">{hour.level}</span>
                      {hour.peak && (
                        <span className="rounded-full bg-amber/15 px-1.5 text-xs font-bold text-amber">
                          Peak
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 break-words text-text-muted">{why || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const TAG_RANK: Record<ActivityTag, number> = { low: 0, med: 1, high: 2, prime: 3 }

export type BestWindow = { hours: HourlyActivity[]; tag: ActivityTag }

/**
 * Sprint 32's "best window" -- derived entirely from `hourly_outlook`
 * already on hand, no extra fetch, per `app.domain.timing`'s own
 * docstring flagging this as the natural follow-up. The longest
 * contiguous run of hours at the day's best activity tag (ties broken
 * by whichever run comes first); `null` when the day never reaches
 * `high` (a `low`/`med`-only day has no window worth calling out).
 */
export function deriveBestWindow(outlook: HourlyOutlook): BestWindow | null {
  const bestRank = Math.max(...outlook.hours.map((hour) => TAG_RANK[hour.tag]))
  if (bestRank < TAG_RANK.high) return null
  const bestTag = (Object.keys(TAG_RANK) as ActivityTag[]).find(
    (tag) => TAG_RANK[tag] === bestRank,
  )!

  let bestRun: HourlyActivity[] = []
  let currentRun: HourlyActivity[] = []
  for (const hour of outlook.hours) {
    if (hour.tag === bestTag) {
      currentRun = [...currentRun, hour]
      if (currentRun.length > bestRun.length) bestRun = currentRun
    } else {
      currentRun = []
    }
  }
  return bestRun.length > 0 ? { hours: bestRun, tag: bestTag } : null
}

/**
 * Shared by `BestWindowCallout` (the full forecast card) and
 * `app/saved/saved-locations-list.tsx`'s compact per-location row
 * (sprint 32's multi-location dashboard) -- one place formats a
 * `BestWindow` as a time range in the location's own timezone, rather
 * than each caller reimplementing the same `Intl.DateTimeFormat` call.
 */
export function formatBestWindowRange(window: BestWindow, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  })
  const start = window.hours[0]
  const end = window.hours[window.hours.length - 1]
  return start.hour === end.hour
    ? formatter.format(new Date(start.time))
    : `${formatter.format(new Date(start.time))} – ${formatter.format(new Date(end.time))}`
}

function BestWindowCallout({ window, timezone }: { window: BestWindow; timezone: string }) {
  const rangeLabel = formatBestWindowRange(window, timezone)
  const reasons = Array.from(new Set(window.hours.flatMap((hour) => hour.reasons)))

  return (
    <div
      className={cx(
        'flex flex-col gap-1 rounded-md border border-border border-l-4 bg-surface-raised px-4 py-3.5',
        window.tag === 'prime' ? 'border-l-tier-prime' : 'border-l-tier-high',
      )}
    >
      <span
        className={cx(
          'section-label',
          window.tag === 'prime' ? 'text-accent!' : 'text-primary!',
        )}
      >
        Best today · {capitalize(window.tag)}
      </span>
      <span className="text-xl font-bold tabular-nums text-text">{rangeLabel}</span>
      {reasons.length > 0 && (
        <span className="text-sm text-text-muted">{reasons.join(' · ')}</span>
      )}
    </div>
  )
}

function YourWindowCallout({ window, timezone }: { window: YourWindow; timezone: string }) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  })
  const start = formatter.format(new Date(window.start))
  const end = formatter.format(new Date(window.end))
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border border-l-4 border-l-primary bg-surface-raised px-4 py-3.5">
      <span className="section-label text-primary!">Your window · {capitalize(window.tag)}</span>
      <span className="text-xl font-bold tabular-nums text-text">
        {start === end ? start : `${start} – ${end}`}
      </span>
      {window.reasons.length > 0 && (
        <span className="text-sm text-text-muted">{window.reasons.join(' · ')}</span>
      )}
    </div>
  )
}

/** The one heading style every forecast section uses: a section label,
 * optional right-hand note. */
function SectionHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="section-label">{title}</h2>
      {aside && <span className="text-xs text-text-muted">{aside}</span>}
    </div>
  )
}

/** The day's 0-100 score as a ring meter: the arc fills in the
 * verdict's color over a track of the same surface, the number sits in
 * the middle. Decorative (`aria-hidden`); the headline carries the score
 * as text for screen readers. The arc animates in on load. */
function ScoreRing({ score, colorClass }: { score: number; colorClass: string }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  return (
    <div aria-hidden="true" className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-border" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className={cx('score-ring-arc stroke-current', colorClass)}
          style={{ '--ring-length': `${circumference}` } as React.CSSProperties}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-2xl font-extrabold tabular-nums text-text sm:text-3xl">{clamped}</span>
        <span className="mt-0.5 text-[0.6875rem] font-semibold text-text-muted">/ 100</span>
      </span>
    </div>
  )
}

/** One stat tile in the "Today's forecast" strip (legacy `.stat-card`):
 * colored top rule, uppercase label, big value, small muted note. */
function StatTile({
  label,
  value,
  note,
  rule,
}: {
  label: string
  value: string
  note?: string
  rule: string
}) {
  return (
    <div className={cx('flex h-full flex-col gap-1 border-t-2 px-5 py-4 sm:px-6', rule)}>
      <dt className="section-label">{label}</dt>
      <dd className="text-2xl font-bold tracking-tight text-text">{value}</dd>
      {note && <dd className="text-xs text-text-muted">{note}</dd>}
    </div>
  )
}

/** A legacy-style collapsible section row ("TODAY'S TIDES ⌄"). */
function CollapsibleSection({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details className="collapsible group min-w-0 border-t border-border first:border-t-0">
      <summary className="flex min-h-14 items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-6">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="section-label text-text!">{title}</span>
          {aside}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="chevron shrink-0 text-text-muted group-hover:text-text">
          <path d="M6 9 L12 15 L18 9" />
        </svg>
      </summary>
      <div className="flex min-w-0 flex-col gap-4 px-5 pb-6 pt-1 sm:px-6">{children}</div>
    </details>
  )
}

export const VERDICT_TEXT: Record<ForecastVerdict, string> = {
  Excellent: 'text-go-text',
  Good: 'text-go-text',
  Fair: 'text-marginal-text',
  Challenging: 'text-accent',
  Poor: 'text-danger-text',
  Unknown: 'text-text-muted',
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** A wind direction as a compass point. Older cached forecasts can
 * carry raw degrees ("32.0") from the CO-OPS wind feed. */
export function compassLabel(direction: string): string {
  const degrees = Number(direction)
  return Number.isFinite(degrees) && direction.trim() !== ''
    ? COMPASS[Math.round(degrees / 22.5) % 16]
    : direction
}

/**
 * "8–13" from a [low, high] range, rounded to *step* (1 for knots, 0.5
 * for feet) so a buoy's 13.4 kt never shows as a false-precision decimal.
 * Shared with the saved-spots cards and the catch log.
 */
export function formatRange(range: [number, number], step = 1): string {
  const round = (value: number) => {
    const rounded = Math.round(value / step) * step
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }
  const [low, high] = range.map(round)
  return low === high ? low : `${low}–${high}`
}

type SpeciesPhoto = {
  src: string
  credit: string
  license: string
  license_url: string
  source_url: string
}

const SPECIES_PHOTOS = speciesPhotos as Record<string, SpeciesPhoto>

/**
 * A species photo, self-hosted from public/species (downloaded once by
 * apps/api's scripts/fetch_species_photos.py from Wikimedia Commons, free
 * licenses only), always with its author/license credit linked to the
 * source page -- the attribution those licenses require.
 */
function SpeciesPhotoFigure({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  const photo = SPECIES_PHOTOS[id]
  if (!photo) return null
  return (
    <figure className="flex flex-col gap-1.5">
      {/* Every frame is the same shape: the photo is shown whole
          (contain) over a blurred, dimmed copy of itself, so a wide
          croaker and a tall surfperch both fill the frame without being
          cropped or letterboxed in mismatched colors. */}
      <div
        className={cx(
          'relative overflow-hidden rounded-md bg-bg',
          compact ? 'aspect-[16/10]' : 'aspect-[16/10] sm:max-w-xs',
        )}
      >
        <img
          src={photo.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-xl"
        />
        <img
          src={photo.src}
          alt={name}
          loading="lazy"
          width={480}
          height={300}
          className="relative h-full w-full object-contain drop-shadow-[0_4px_12px_rgb(0_0_0/35%)]"
        />
      </div>
      <figcaption className="truncate px-1 text-[0.6875rem] text-text-muted">
        <a
          href={photo.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
        >
          Photo: {photo.credit} · {photo.license}
        </a>
      </figcaption>
    </figure>
  )
}

const GUIDANCE_TIER_PILL: Record<GuidanceTier, string> = {
  prime: 'border-accent/50 bg-accent-tint text-accent',
  good: 'border-primary/50 bg-primary-tint text-primary',
  fair: 'border-border bg-surface text-text-muted',
}

/**
 * Sprint 35's "What's biting" -- the original dashboard's ranked species
 * cards. Each card shows apps/api's own `reasons` (the exact numbers the
 * pick was scored on) so no recommendation appears without its "why".
 */
function WhatsBiting({ guidance }: { guidance: FishingGuidance }) {
  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader
        title="What's biting"
        aside={
          guidance.basis.water_temp_is_fallback
            ? 'Based on the monthly average water temperature'
            : `Ranked for ${Math.round(guidance.basis.water_temp_f)}°F water`
        }
      />

      {guidance.species.length > 1 && (
        <p className="-mt-2 text-xs text-text-muted sm:hidden">
          Swipe for all {guidance.species.length} picks →
        </p>
      )}
      {guidance.species.length === 0 ? (
        <p className="text-sm text-text-muted">
          None of the common surf and pier targets for this area are in range at{' '}
          {Math.round(guidance.basis.water_temp_f)}°F right now.
        </p>
      ) : (
        // Phones: a swipeable row (snap per card, next card peeking in);
        // wider screens: a 2/3-column grid.
        <ol className="no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {guidance.species.map((pick, index) => (
            <li
              key={pick.id}
              className="flex w-[84%] shrink-0 snap-start flex-col gap-2.5 overflow-hidden rounded-md border sm:w-auto border-border bg-surface-raised p-3 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60"
            >
              <SpeciesPhotoFigure id={pick.id} name={pick.name} compact />
              <div className="flex flex-col gap-2 px-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-bold leading-snug text-text">{pick.name}</span>
                  <span
                    aria-label={`Rank ${index + 1}`}
                    className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-border px-1.5 text-xs font-bold tabular-nums text-text"
                  >
                    {index + 1}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cx(
                      'rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
                      GUIDANCE_TIER_PILL[pick.tier],
                    )}
                  >
                    {capitalize(pick.tier)}
                  </span>
                  {pick.matches_profile && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-contrast">
                      Your target
                    </span>
                  )}
                </div>
                <p className="text-sm text-text">
                  <span className="text-text-muted">Bait: </span>
                  {pick.bait}
                </p>
                {pick.regulation && (
                  <p className="text-sm text-text">
                    <span className="text-text-muted">{pick.regulation.state} limits: </span>
                    {[pick.regulation.min_size, pick.regulation.bag_limit]
                      .filter(Boolean)
                      .join(' · ') || 'see state rules'}
                  </p>
                )}
                <ul className="mt-0.5 flex flex-col gap-1 border-t border-border pt-2.5 text-xs leading-relaxed text-text-muted">
                  {pick.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <span aria-hidden="true" className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-text-muted" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}

      {guidance.tackle_note && (
        <p className="rounded-md border border-marginal-border bg-marginal-bg px-3 py-2 text-sm text-marginal-text">
          {guidance.tackle_note}
        </p>
      )}
    </Card>
  )
}

const _MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const _MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The original "Species calendar": every target species for the region,
 * month by month -- peak (coral), good (blue) or off. A real table, so
 * screen readers get each cell's level as text (the colored block is
 * decorative); the current month's column is outlined.
 */
function SpeciesCalendar({
  rows,
  currentMonth,
}: {
  rows: NonNullable<FishingGuidance['calendar']>
  currentMonth: number
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="relative max-w-full overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-left text-sm sm:w-auto">
          <caption className="sr-only">Peak and good months for each species in this area</caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="py-1 pr-3 font-medium">
                Species
              </th>
              {_MONTH_INITIALS.map((initial, index) => (
                <th
                  key={index}
                  scope="col"
                  className={cx(
                    'w-7 py-1 text-center text-xs font-bold sm:w-9',
                    index + 1 === currentMonth && 'text-accent',
                  )}
                >
                  <abbr title={_MONTH_NAMES[index]} className="no-underline">
                    {initial}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="whitespace-nowrap py-0.5 pr-6 font-semibold text-text">
                  {row.name}
                </th>
                {row.months.map((level, index) => (
                  <td key={index} className="px-0.5 py-0.5">
                    <span
                      className={cx(
                        'block h-5 rounded-sm',
                        level === 'peak' && 'bg-tier-prime',
                        level === 'good' && 'bg-tier-high',
                        level === '' && 'bg-tier-low',
                        index + 1 === currentMonth && 'ring-2 ring-text',
                      )}
                    />
                    <span className="sr-only">
                      {_MONTH_NAMES[index]}: {level === 'peak' ? 'peak' : level === 'good' ? 'good' : 'off'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-tier-prime" /> Peak
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-tier-high" /> Good
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-tier-low" /> Off season
        </span>
      </div>
    </div>
  )
}

/** "2026-04" -> "Apr 2026" (the regulations snapshot month). */
function formatAsOf(asOf: string): string {
  const [year, month] = asOf.split('-').map(Number)
  if (!year || !month) return asOf
  return `${_MONTH_NAMES[month - 1].slice(0, 3)} ${year}`
}

/**
 * "Rigs & tips": the rigs today's picks call for, taught once each --
 * a diagram (rig-diagram.tsx), how to tie it and how to fish it
 * (lib/rigs.ts) -- then the exact hook, sinker and setup for each of
 * today's fish that use it. Rigs are ordered by the best-ranked pick
 * that uses them as its main rig; a fish that lists an alternative rig
 * is named under that rig too ("also works for").
 */
function RigsAndTips({
  guidance,
  profile = null,
}: {
  guidance: FishingGuidance
  profile?: Preferences | null
}) {
  const waters = watersFor(profile)
  // Lure-only rigs are skipped for someone who never fishes lures.
  const skipJig = profile?.uses_lures === 'no'
  const groups = new Map<RigId, { main: SpeciesPick[]; also: SpeciesPick[] }>()
  for (const pick of guidance.species) {
    rigsFor(pick.rig).forEach((id, index) => {
      const group = groups.get(id) ?? { main: [], also: [] }
      ;(index === 0 ? group.main : group.also).push(pick)
      groups.set(id, group)
    })
  }
  if (skipJig) groups.delete('jig')
  // Rigs that suit the user's kind of water come first, then rigs that
  // are some pick's main rig, then alternatives; otherwise pick order.
  const fit = (id: RigId) => {
    const ranks = waters.map((water) => RIG_FIT[water].indexOf(id)).filter((rank) => rank >= 0)
    return ranks.length ? Math.min(...ranks) : Infinity
  }
  const entries = [...groups.entries()]
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        Number(a.entry[1].main.length === 0) - Number(b.entry[1].main.length === 0) ||
        fit(a.entry[0]) - fit(b.entry[0]) ||
        a.index - b.index,
    )
    .map(({ entry }) => entry)

  const fittingWater = (id: RigId) => waters.find((water) => RIG_FIT[water].includes(id))
  const waterTips = (id: RigId) =>
    waters
      .map((water) => ({ water, tip: RIG_WATER_TIPS[id]?.[water] }))
      .filter((entry): entry is { water: (typeof waters)[number]; tip: string } => Boolean(entry.tip))

  return (
    <>
      {skipJig && guidance.species.some((pick) => rigsFor(pick.rig).includes('jig')) && (
        <p className="text-xs text-text-muted">
          Jig rigs are hidden because your profile says you don&apos;t fish lures.
        </p>
      )}
      <ol className="flex flex-col gap-4">
        {ordered.map(([id, group]) => {
          const rig = RIGS[id]
          const fish = [...group.main, ...group.also]
          return (
            <li
              key={id}
              className="grid grid-cols-1 gap-5 rounded-md border border-border bg-surface-raised p-4 sm:p-5 md:grid-cols-[minmax(0,22rem)_1fr]"
            >
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-border bg-bg/60 p-2">
                  <RigDiagram id={id} className="h-auto w-full" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-text-muted">For today:</span>
                  {group.main.map((pick) => (
                    <span key={pick.id} className="rounded-full bg-primary-tint px-2 py-0.5 font-semibold text-primary">
                      {pick.name}
                    </span>
                  ))}
                  {group.also.length > 0 && (
                    <span className="text-text-muted">
                      {group.main.length > 0 ? 'also ' : ''}
                      {group.also.map((pick) => pick.name).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold text-text">
                    {rig.name}
                    {fittingWater(id) && (
                      <span className="rounded-full bg-go-bg px-2 py-0.5 text-xs font-bold text-go-text">
                        Suits your {WATER_NOUN[fittingWater(id)!]} fishing
                      </span>
                    )}
                  </h3>
                  <p className="text-sm leading-relaxed text-text-muted">{rig.summary}</p>
                  {waterTips(id).map(({ water, tip }) => (
                    <p
                      key={water}
                      className="rounded-md border-l-4 border-l-primary bg-primary-tint px-3 py-2 text-sm text-text"
                    >
                      <span className="font-semibold">{WATER_PHRASE[water]}: </span>
                      {tip}
                    </p>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="flex flex-col gap-2">
                    <h4 className="section-label">How to tie it</h4>
                    <ul className="flex flex-col gap-2 text-sm text-text">
                      {rig.tie.map((step, index) => (
                        <li key={step} className="flex gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-[0.6875rem] font-bold tabular-nums text-text">
                            {index + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="flex flex-col gap-2">
                    <h4 className="section-label">Fishing it</h4>
                    <ul className="flex flex-col gap-2 text-sm text-text">
                      {rig.tips.map((tip) => (
                        <li key={tip} className="flex gap-2.5">
                          <span aria-hidden="true" className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="leading-relaxed">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                <section className="flex flex-col gap-2 border-t border-border pt-3">
                  <h4 className="section-label">Hook &amp; sinker for today&apos;s fish</h4>
                  <ul className="flex flex-col gap-2.5">
                    {fish.map((pick) => (
                      <li key={pick.id} className="flex flex-col gap-0.5 text-sm">
                        <span className="font-semibold text-text">{pick.name}</span>
                        <span className="text-text">
                          <span className="text-text-muted">Hook </span>
                          {pick.hook_size}
                          <span className="text-text-muted"> · Sinker </span>
                          {pick.sinker}
                        </span>
                        <span className="text-xs text-text-muted">
                          Setup: {pick.rig}
                          {pick.lures && !/not (a |typically )?(primary )?lure|rarely taken on lures/i.test(pick.lures) && ` · Lures: ${pick.lures}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="text-xs text-text-muted">{guidance.disclaimer}</p>
    </>
  )
}

/** "Size & bag limits": the state rules for today's picks, each with its
 * snapshot date and a link to the official source. */
function SizeAndBagLimits({ guidance }: { guidance: FishingGuidance }) {
  const picks = guidance.species.filter((pick) => pick.regulation)
  return (
    <ul className="flex flex-col divide-y divide-border">
      {picks.map((pick) => {
        const regulation = pick.regulation!
        return (
          <li key={pick.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 text-sm">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold text-text">{pick.name}</span>
              <span className="text-xs text-text-muted">{regulation.state}</span>
            </span>
            <span className="text-text">
              {[
                regulation.min_size && `Min ${regulation.min_size}`,
                regulation.bag_limit,
                regulation.season,
              ]
                .filter(Boolean)
                .join(' · ') || 'See state rules'}
            </span>
            {regulation.notes && <span className="text-text-muted">{regulation.notes}</span>}
            <span className="text-xs text-text-muted">
              As of {formatAsOf(regulation.as_of)}
              {regulation.possibly_outdated && ' — may be out of date'}
              {regulation.source_url && (
                <>
                  {' · '}
                  <a
                    href={regulation.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Official {regulation.state} rules
                  </a>
                </>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Presentational rendering of a `ForecastEnvelope`, laid out like the
 * original Saltline dashboard and shared by both forecast pages:
 *
 * 1. "Today's forecast" -- the verdict as a big colored headline beside
 *    a 0-100 score ring (`ScoreRing`), apps/api's plain-language summary,
 *    then stat tiles for water temp, wind, waves (rounded by
 *    `formatRange`) and confidence/freshness.
 * 2. "Fishing activity today" -- `HourlyChart` (hourly-chart.tsx).
 * 3. "When to fish" -- the best window, plus the signed-in user's own
 *    window when their profile has usual times.
 * 4. "What's biting" -- sprint 35's ranked picks, each with its reasons.
 * 5. Collapsible rows for pack for today, rigs & tips (sprint 35's tackle detail), the
 *    species calendar, tides, the hour-by-hour table (the chart's
 *    accessible text alternative), sprint 33's per-source status, and
 *    warnings.
 *
 * The verdict is always visible text, never color alone.
 * `VERDICT_TO_BADGE`/`deriveBestWindow`/`formatBestWindowRange` stay
 * exported for `app/saved/saved-locations-list.tsx`'s compact rows.
 */
export function ForecastCard({
  forecast,
  cams = [],
  profile = null,
}: {
  forecast: ForecastEnvelope
  /** Nearby public live-cam links (lib/get-cams.ts). */
  cams?: NearbyCam[]
  /** The signed-in user's fishing profile; null on the public share page. */
  profile?: Preferences | null
}) {
  const score = forecast.conditions?.score
  const bestWindow = forecast.hourly_outlook ? deriveBestWindow(forecast.hourly_outlook) : null
  // Every other timestamp in this card (tides, hourly outlook, the best-
  // window callout) is formatted in the location's own timezone via
  // Intl.DateTimeFormat -- `generated_at` was the one left as apps/api's
  // raw ISO datetime string, unreadable at a glance and the one
  // inconsistent date in the card.
  const generatedAtLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: forecast.location.timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(forecast.generated_at))

  const verdict = score?.verdict ?? 'Unknown'
  const conditions = forecast.conditions
  const waterTemp = conditions?.water_temperature
  const sourcesDown = forecast.sources.filter((source) => source.state !== 'ok').length

  return (
    <div className="rise-in flex min-w-0 flex-col gap-4 sm:gap-5">
      <WeatherAlerts
        alerts={(forecast.conditions as SkyConditions | null)?.alerts ?? []}
        timezone={forecast.location.timezone}
      />
      <Card className="overflow-hidden p-0!">
        <div className="flex flex-col gap-2 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <h2 className="section-label">Today&apos;s forecast</h2>
              <p
                className={cx(
                  'text-4xl font-extrabold uppercase leading-none tracking-tight break-words sm:text-5xl',
                  VERDICT_TEXT[verdict],
                )}
              >
                {verdict}
                {score && score.score !== null && (
                  <span className="sr-only">, score {score.score} out of 100</span>
                )}
              </p>
              {forecast.conditions?.comfort?.over_limit && (
                <p className="w-fit rounded-md border border-marginal-border bg-marginal-bg px-2.5 py-1 text-xs font-semibold text-marginal-text">
                  Over your comfort limits
                  {score?.personalized_from && ` · ${score.personalized_from} for most anglers`}
                </p>
              )}
            </div>
            {score && score.score !== null && (
              <ScoreRing score={score.score} colorClass={VERDICT_TEXT[verdict]} />
            )}
          </div>
          {score?.summary && (
            <p className="max-w-3xl text-sm leading-relaxed text-text-muted sm:text-base">{score.summary}</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          {waterTemp && (
            <div className="bg-surface">
              <StatTile
                label="Water temp"
                value={`${waterTemp.value.toFixed(1)}°F`}
                note={waterTemp.is_fallback ? 'monthly avg' : 'live reading'}
                rule="border-t-tier-high"
              />
            </div>
          )}
          <div className="bg-surface">
            <StatTile
              label="Wind"
              value={
                conditions?.wind_range_kt
                  ? `${conditions.wind_direction ? `${compassLabel(conditions.wind_direction)} ` : ''}${formatRange(conditions.wind_range_kt)} kt`
                  : '—'
              }
              note={conditions?.wind_range_kt ? 'next 24 h' : 'unavailable'}
              rule="border-t-border"
            />
          </div>
          <div className="bg-surface">
            <StatTile
              label="Waves"
              value={conditions?.wave_range_ft ? `${formatRange(conditions.wave_range_ft, 0.5)} ft` : '—'}
              note={conditions?.wave_range_ft ? 'next 24 h' : 'unavailable'}
              rule="border-t-border"
            />
          </div>
          <div className="bg-surface">
            <StatTile
              label="Confidence"
              value={capitalize(forecast.confidence.level)}
              note={`Updated ${generatedAtLabel}`}
              rule={
                forecast.state === 'fresh'
                  ? 'border-t-go-border'
                  : forecast.state === 'unavailable'
                    ? 'border-t-nogo-border'
                    : 'border-t-marginal-border'
              }
            />
          </div>
        </dl>
      </Card>

      <YourDay forecast={forecast} profile={profile} />

      {forecast.hourly_outlook && (
        <Card className="flex flex-col gap-4">
          <SectionHeader title="Fishing activity today" aside="0–100, by hour" />
          <HourlyChart outlook={forecast.hourly_outlook} />
        </Card>
      )}

      {(bestWindow || forecast.hourly_outlook?.your_window) && (
        <Card className="flex flex-col gap-4">
          <SectionHeader title="When to fish" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {bestWindow && (
              <BestWindowCallout window={bestWindow} timezone={forecast.location.timezone} />
            )}
            {forecast.hourly_outlook?.your_window && (
              <YourWindowCallout
                window={forecast.hourly_outlook.your_window}
                timezone={forecast.location.timezone}
              />
            )}
          </div>
        </Card>
      )}

      <SunAndMoon forecast={forecast} now={currentTime()} />

      {forecast.recommendations && <WhatsBiting guidance={forecast.recommendations} />}

      <Card className="flex min-w-0 flex-col overflow-hidden p-0!">
        {forecast.recommendations?.pack && (
          <CollapsibleSection
            title="Pack for today"
            aside={
              <span className="text-sm text-text-muted">
                {forecast.recommendations.pack.headline}
              </span>
            }
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              {forecast.recommendations.pack.rows.map((row) => (
                <div key={row.kind} className="contents">
                  <dt className="section-label pt-0.5">{row.label}</dt>
                  <dd className="text-text">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleSection>
        )}

        {((forecast.recommendations && forecast.recommendations.species.length > 0) ||
          watersFor(profile).length > 0) && (
          <CollapsibleSection
            title="Rigs & tips"
            aside={
              watersFor(profile).length > 0 ? (
                <span className="text-xs text-text-muted">
                  Where to fish, then the rigs for today
                </span>
              ) : undefined
            }
          >
            <WhereToFish forecast={forecast} profile={profile} />
            {forecast.recommendations && forecast.recommendations.species.length > 0 && (
              <>
                {watersFor(profile).length > 0 && (
                  <h3 className="section-label mt-2">Rigs for today</h3>
                )}
                <RigsAndTips guidance={forecast.recommendations} profile={profile} />
              </>
            )}
          </CollapsibleSection>
        )}

        {forecast.recommendations?.species.some((pick) => pick.regulation) && (
          <CollapsibleSection title="Size & bag limits">
            <SizeAndBagLimits guidance={forecast.recommendations} />
          </CollapsibleSection>
        )}

        {forecast.recommendations?.calendar && forecast.recommendations.calendar.length > 0 && (
          <CollapsibleSection title="Species calendar">
            <SpeciesCalendar
              rows={forecast.recommendations.calendar}
              currentMonth={forecast.recommendations.basis.month}
            />
          </CollapsibleSection>
        )}

        {cams.length > 0 && (
          <CollapsibleSection
            title="Live cams"
            aside={<span className="text-xs text-text-muted">{cams.length} nearby</span>}
          >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cams.map((cam) => (
                <li
                  key={cam.id}
                  className="flex flex-col gap-1 rounded-md border border-border bg-surface-raised px-4 py-3"
                >
                  <span className="section-label text-primary!">{cam.cam_type} cam</span>
                  <span className="font-bold text-text">{cam.name}</span>
                  <span className="text-xs text-text-muted">{cam.distance_miles} miles away</span>
                  <a
                    href={cam.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 text-sm font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Open live cam<span className="sr-only"> (opens the cam&apos;s own site in a new tab)</span> ↗
                  </a>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {forecast.tides && (
          <CollapsibleSection
            title="Tides"
            aside={<span className="text-xs text-text-muted">Next 24 hours, then the full list</span>}
          >
            <TideChart tides={forecast.tides} timezone={forecast.location.timezone} />
            <TideTable tides={forecast.tides} timezone={forecast.location.timezone} />
          </CollapsibleSection>
        )}

        {forecast.hourly_outlook && (
          <CollapsibleSection title="Hour by hour">
            <HourlyOutlookTable
              outlook={forecast.hourly_outlook}
              timezone={forecast.location.timezone}
            />
          </CollapsibleSection>
        )}

        {forecast.sources.length > 0 && (
          <CollapsibleSection
            title="Data sources"
            aside={
              <Badge variant={FORECAST_STATE_TO_BADGE[forecast.state]}>
                {capitalize(forecast.state)}
                {sourcesDown > 0 && ` · ${sourcesDown} down`}
              </Badge>
            }
          >
            <SourceStatusList sources={forecast.sources} />
          </CollapsibleSection>
        )}

        {forecast.warnings.length > 0 && (
          <CollapsibleSection
            title="Warnings"
            aside={<Badge variant="marginal">{forecast.warnings.length}</Badge>}
          >
            <ul className="flex flex-col gap-1 text-sm text-text-muted">
              {forecast.warnings.map((warning) => (
                <li key={warning.code} className="break-words">
                  {warning.message}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </Card>
    </div>
  )
}

/** The "couldn't load" state, shared the same way. */
/**
 * Sprint 47 ("Degraded-mode UX"): this used to dump `err.message`
 * (a raw fetch/`InternalApiError` message -- e.g. `fetch failed` for a
 * plain network error, or apps/api's own Starlette default 500 body
 * text) straight into the page, plus an unconditional dev-only
 * troubleshooting paragraph naming internal service/env-var details
 * ("Is apps/api running (`uvicorn app.main:app`)...") -- fine advice
 * for a developer running `next dev`, actively confusing (and a real
 * internal-implementation disclosure) for an actual visitor hitting a
 * genuine production outage. Production now gets one honest, generic
 * message and a real retry action; the raw message and dev
 * troubleshooting text are gated on `NODE_ENV` -- a Server Component
 * reading its own process's env, not something a visitor can spoof.
 */
export function ForecastErrorCard({
  message,
  reason,
  retryHref,
}: {
  message: string
  /** Plain-language cause, safe for any visitor (lib/diagnose-api.ts). */
  reason?: string | null
  /** Omit to hide the retry button (no sensible URL to retry from). */
  retryHref?: string
}) {
  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <Card>
      <h2 className="font-semibold text-text">Couldn&apos;t load the forecast</h2>
      <p className="mt-1 text-sm text-text-muted">
        This is usually temporary -- live tide, wind, and wave data couldn&apos;t be reached
        just now. Try again in a moment.
      </p>
      {reason && <p className="mt-3 break-words text-sm text-text">{reason}</p>}
      {isDev && (
        <>
          <p className="mt-3 break-words text-sm text-danger-text">{message}</p>
          <p className="mt-3 break-words text-sm text-text-muted">
            Dev only: is apps/api running (<code>uvicorn app.main:app</code>) with a matching{' '}
            <code>INTERNAL_SIGNING_KEY_ID</code>/<code>INTERNAL_SIGNING_KEY_SECRET</code>? See
            apps/web/README.md.
          </p>
        </>
      )}
      {retryHref && (
        <div className="mt-4">
          <Button variant="primary" href={retryHref}>
            Try again
          </Button>
        </div>
      )}
    </Card>
  )
}
