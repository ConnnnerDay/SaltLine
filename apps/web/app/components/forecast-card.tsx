import { Badge, type BadgeVariant, Button, Card } from './ui'
import { cx } from './ui/cx'
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

const ACTIVITY_TAG_TO_BADGE: Record<ActivityTag, BadgeVariant> = {
  prime: 'go',
  high: 'go',
  med: 'marginal',
  low: 'neutral',
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

const _TIDE_CHART_WIDTH = 600
const _TIDE_CHART_HEIGHT = 110
const _TIDE_CHART_TOP = 16
const _TIDE_CHART_BOTTOM = 84
// Horizontal padding so the first/last point's centered height label
// (text-anchor="middle") isn't clipped by the viewBox edge.
const _TIDE_CHART_SIDE_PADDING = 18

/**
 * Sprint 34's remaining "accessible charts" sub-item for tides -- a
 * point chart, not an interpolated curve: NOAA CO-OPS's `hilo`
 * predictions product (`app.providers.noaa_coops.fetch_tide_predictions`)
 * gives real predicted heights only at each high/low extremum, not a
 * continuous hourly series, so plotting a smooth cosine-shaped curve
 * between them would be *inventing* the in-between shape rather than
 * showing real predicted values -- exactly the kind of unsupported
 * invention `docs/product-definition.md`'s Integrity rule (already
 * enforced server-side, e.g. `is_fallback` labeling) argues against
 * doing on the frontend too. Straight lines between real points are
 * an honest visual summary of the same handful of values
 * `TideTable` already lists as text; every point still gets a native
 * SVG `<title>` with its exact time/height, and each point's height
 * is labeled directly (a small point count, unlike the 24-bar hourly
 * chart, is exactly the case `dataviz`'s "label selectively" guidance
 * allows labeling every point). Single-hue on `--color-primary` (a
 * magnitude series, not a categorical one -- same reasoning as
 * `HourlyOutlookChart`), `aria-hidden="true"` alongside the
 * already-complete `TideTable`, no `tabindex` inside it (an
 * `aria-hidden` subtree must never contain a keyboard-focusable
 * element). The x-axis is real elapsed time between the first and
 * last prediction, not evenly-spaced-by-index, since predictions can
 * span more than one day unevenly.
 */
function TideChart({ tides, timezone }: { tides: ForecastTides; timezone: string }) {
  const points = tides.predictions
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

  const plotWidth = _TIDE_CHART_WIDTH - _TIDE_CHART_SIDE_PADDING * 2
  const coords = points.map((prediction, index) => ({
    prediction,
    x: _TIDE_CHART_SIDE_PADDING + ((times[index] - minTime) / timeSpan) * plotWidth,
    y:
      _TIDE_CHART_BOTTOM -
      ((prediction.height_ft - minHeight) / heightSpan) *
        (_TIDE_CHART_BOTTOM - _TIDE_CHART_TOP),
  }))

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')

  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${_TIDE_CHART_WIDTH} ${_TIDE_CHART_HEIGHT}`}
        role="presentation"
        className="w-full"
      >
        <path d={linePath} fill="none" strokeWidth={2} className="stroke-primary" />
        {coords.map(({ prediction, x, y }) => (
          <g key={prediction.time}>
            <circle cx={x} cy={y} r={4} className="fill-primary">
              <title>
                {`${prediction.kind === 'high' ? 'High' : 'Low'} tide, ${timeFormatter.format(
                  new Date(prediction.time),
                )}: ${prediction.height_ft.toFixed(1)} ft`}
              </title>
            </circle>
            <text
              x={x}
              y={prediction.kind === 'high' ? y - 10 : y + 18}
              textAnchor="middle"
              className="fill-text-muted text-[9px]"
            >
              {prediction.height_ft.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
      <p className="text-xs text-text-muted">
        Predicted tide height over time; each point is a high or low tide.
      </p>
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
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Upcoming high and low tides for {tides.station_id}
          </caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="py-1 pr-4 font-medium">
                Time
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
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
                <td className="py-1.5 pr-4 text-text">
                  {formatter.format(new Date(prediction.time))}
                </td>
                <td className="py-1.5 pr-4 text-text">
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

const _SHORT_HOURS = [
  '12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a',
  '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p',
]

const _CHART_SLOT = 30
const _CHART_BAR_WIDTH = 22
const _CHART_BAR_MAX_HEIGHT = 90
const _CHART_BASELINE_Y = 100
const _CHART_WIDTH = _CHART_SLOT * 24
const _CHART_HEIGHT = 128

/**
 * Sprint 34's hourly-outlook visual chart, drawn in the original
 * Saltline style: one bar per hour, colored by activity tier (prime
 * coral, high blue, med amber, low navy) with a text legend, and the
 * current hour labeled "Now". It's `aria-hidden`: `HourlyOutlookTable`
 * carries the same data as real text, and the legend plus bar height
 * mean color is never the only channel. Each bar has a native SVG
 * `<title>` tooltip but nothing focusable (axe-core's
 * `aria-hidden-focus` rule).
 */
const TIER_FILL: Record<ActivityTag, string> = {
  prime: 'fill-tier-prime',
  high: 'fill-tier-high',
  med: 'fill-tier-med',
  low: 'fill-tier-low',
}

const TIER_LEGEND: { tag: ActivityTag; label: string; swatch: string }[] = [
  { tag: 'prime', label: 'Prime', swatch: 'bg-tier-prime' },
  { tag: 'high', label: 'High', swatch: 'bg-tier-high' },
  { tag: 'med', label: 'Good', swatch: 'bg-tier-med' },
  { tag: 'low', label: 'Low', swatch: 'bg-tier-low' },
]

function HourlyOutlookChart({ outlook }: { outlook: HourlyOutlook }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      {/* Below ~560px the 24 bars get too thin to read, so the chart
          keeps a minimum width and scrolls sideways inside its card. */}
      <div className="-mx-1 overflow-x-auto px-1">
      <svg
        viewBox={`0 0 ${_CHART_WIDTH} ${_CHART_HEIGHT}`}
        role="presentation"
        className="w-full min-w-[560px]"
      >
        <line
          x1={0}
          y1={_CHART_BASELINE_Y}
          x2={_CHART_WIDTH}
          y2={_CHART_BASELINE_Y}
          strokeWidth={1}
          className="stroke-border"
        />
        {outlook.hours.map((hour, index) => {
          const x = index * _CHART_SLOT + (_CHART_SLOT - _CHART_BAR_WIDTH) / 2
          const barHeight = Math.max(2, (hour.level / 100) * _CHART_BAR_MAX_HEIGHT)
          const y = _CHART_BASELINE_Y - barHeight
          return (
            <g key={hour.hour}>
              <rect
                x={x}
                y={y}
                width={_CHART_BAR_WIDTH}
                height={barHeight}
                rx={2}
                strokeWidth={hour.is_now ? 2 : 0}
                className={cx(TIER_FILL[hour.tag], hour.is_now && 'stroke-text')}
              >
                <title>{`${_SHORT_HOURS[hour.hour]}: ${hour.level}/100 (${hour.tag})`}</title>
              </rect>
              {hour.peak && (
                <circle
                  cx={x + _CHART_BAR_WIDTH / 2}
                  cy={y - 6}
                  r={3}
                  className="fill-amber"
                />
              )}
              {hour.is_now && (
                <text
                  x={x + _CHART_BAR_WIDTH / 2}
                  y={_CHART_HEIGHT - 6}
                  textAnchor="middle"
                  className="fill-accent text-[9px] font-bold"
                >
                  Now
                </text>
              )}
            </g>
          )
        })}
        {outlook.hours.map((hour, index) =>
          index % 3 === 0 && !hour.is_now ? (
            <text
              key={`label-${hour.hour}`}
              x={index * _CHART_SLOT + _CHART_SLOT / 2}
              y={_CHART_HEIGHT - 6}
              textAnchor="middle"
              className="fill-text-muted text-[9px]"
            >
              {_SHORT_HOURS[hour.hour]}
            </text>
          ) : null,
        )}
      </svg>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-muted">
        {TIER_LEGEND.map((item) => (
          <span key={item.tag} className="flex items-center gap-1.5">
            <span className={cx('h-2.5 w-2.5 rounded-sm', item.swatch)} />
            {item.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber" />
          Day&apos;s peak
        </span>
      </div>
    </div>
  )
}

/**
 * Sprint 34's hourly outlook table -- the "text alternatives" half of
 * the acceptance bar (apps/api's `app.domain.timing.
 * build_hourly_outlook`, backend), rendered alongside
 * `HourlyOutlookChart` above as the real accessible representation
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
              const why = [
                ...hour.reasons,
                hour.tide_event ? `${capitalize(hour.tide_event)} tide` : null,
              ]
                .filter((part): part is string => Boolean(part))
                .join(' · ')
              return (
                <tr
                  key={hour.hour}
                  className={cx('border-t border-border', hour.is_now && 'bg-primary/10')}
                >
                  <td className="py-1.5 pr-4 whitespace-nowrap text-text">
                    {formatter.format(new Date(hour.time))}
                    {hour.is_now && <span className="text-text-muted"> (now)</span>}
                  </td>
                  <td className="py-1.5 pr-4">
                    <Badge variant={ACTIVITY_TAG_TO_BADGE[hour.tag]}>
                      {capitalize(hour.tag)}
                      {hour.peak && ' · Peak'}
                    </Badge>
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
        'flex min-w-[12rem] flex-col items-center gap-1 rounded-md border border-border border-t-2 bg-surface-raised px-5 py-3.5 text-center',
        window.tag === 'prime' ? 'border-t-tier-prime' : 'border-t-tier-high',
      )}
    >
      <span
        className={cx(
          'text-[0.6875rem] font-bold uppercase tracking-widest',
          window.tag === 'prime' ? 'text-accent' : 'text-primary',
        )}
      >
        {capitalize(window.tag)}
      </span>
      <span className="text-lg font-bold text-text">{rangeLabel}</span>
      {reasons.length > 0 && (
        <span className="font-serif text-sm italic text-text-muted">{reasons.join(' · ')}</span>
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
    <div className="flex min-w-[12rem] flex-col items-center gap-1 rounded-md border border-border border-t-2 border-t-primary bg-surface-raised px-5 py-3.5 text-center">
      <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-primary">
        Your window · {capitalize(window.tag)}
      </span>
      <span className="text-lg font-bold text-text">
        {start === end ? start : `${start} – ${end}`}
      </span>
      {window.reasons.length > 0 && (
        <span className="font-serif text-sm italic text-text-muted">
          {window.reasons.join(' · ')}
        </span>
      )}
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
    <div className={cx('flex flex-col gap-1 border-t-2 bg-surface-raised/60 px-4 py-3', rule)}>
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
    <details className="collapsible min-w-0 border-t border-border">
      <summary className="flex items-center justify-between gap-3 px-1 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-text">{title}</span>
          {aside}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="chevron shrink-0 text-text-muted">
          <path d="M6 9 L12 15 L18 9" />
        </svg>
      </summary>
      <div className="flex min-w-0 flex-col gap-4 px-1 pb-5">{children}</div>
    </details>
  )
}

const VERDICT_TEXT: Record<ForecastVerdict, string> = {
  Excellent: 'text-go-text',
  Good: 'text-go-text',
  Fair: 'text-marginal-text',
  Challenging: 'text-accent',
  Poor: 'text-danger-text',
  Unknown: 'text-text-muted',
}

function formatRange(range: [number, number]): string {
  const [low, high] = range
  return low === high ? `${low}` : `${low}–${high}`
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
    <figure className="flex flex-col gap-1">
      <img
        src={photo.src}
        alt={name}
        loading="lazy"
        width={480}
        height={300}
        className={cx(
          'w-full rounded-md bg-bg object-contain',
          compact ? 'aspect-[16/9]' : 'aspect-[16/9] sm:max-w-xs',
        )}
      />
      <figcaption className="truncate text-[0.625rem] text-text-muted">
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

const GUIDANCE_TIER_TEXT: Record<GuidanceTier, string> = {
  prime: 'text-accent',
  good: 'text-primary',
  fair: 'text-text-muted',
}

/**
 * Sprint 35's "What's biting" -- the original dashboard's ranked species
 * cards. Each card shows apps/api's own `reasons` (the exact numbers the
 * pick was scored on) so no recommendation appears without its "why".
 */
function WhatsBiting({ guidance }: { guidance: FishingGuidance }) {
  return (
    <Card className="flex flex-col gap-4 border-l-2 border-l-tier-prime p-5!">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-label">What&apos;s biting</h2>
        {guidance.basis.water_temp_is_fallback && (
          <span className="text-xs text-text-muted">
            Based on the monthly average water temperature
          </span>
        )}
      </div>

      {guidance.species.length === 0 ? (
        <p className="text-sm text-text-muted">
          None of the common surf and pier targets for this area are in range at{' '}
          {Math.round(guidance.basis.water_temp_f)}°F right now.
        </p>
      ) : (
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {guidance.species.map((pick, index) => (
            <li
              key={pick.id}
              className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-raised px-4 py-3"
            >
              <SpeciesPhotoFigure id={pick.id} name={pick.name} compact />
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold leading-tight text-text">{pick.name}</span>
                <span
                  aria-label={`Rank ${index + 1}`}
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-border px-1.5 text-[0.6875rem] font-bold text-text"
                >
                  {index + 1}
                </span>
              </div>
              <span
                className={cx(
                  'text-[0.6875rem] font-bold uppercase tracking-widest',
                  GUIDANCE_TIER_TEXT[pick.tier],
                )}
              >
                {capitalize(pick.tier)}
                {pick.matches_profile && (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-primary-contrast">
                    Your target
                  </span>
                )}
              </span>
              <p className="line-clamp-2 text-sm text-text-muted">{pick.bait}</p>
              {pick.regulation && (
                <p className="text-xs text-text-muted">
                  <span className="font-bold text-text">{pick.regulation.state}:</span>{' '}
                  {[pick.regulation.min_size, pick.regulation.bag_limit]
                    .filter(Boolean)
                    .join(' · ') || 'see state rules'}
                </p>
              )}
              <p className="font-serif text-sm italic text-text-muted">
                {pick.reasons.join(' · ')}
              </p>
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
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-left text-sm">
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
                    'w-7 py-1 text-center text-xs font-bold',
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
                <th scope="row" className="whitespace-nowrap py-0.5 pr-3 font-semibold text-text">
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

/** Sprint 35's per-pick tackle detail (the original "Rigs & tips" row). */
function RigsAndTips({ guidance }: { guidance: FishingGuidance }) {
  return (
    <>
      <ul className="flex flex-col gap-4">
        {guidance.species.map((pick) => (
          <li key={pick.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
            <h3 className="text-base font-bold text-text">{pick.name}</h3>
            <SpeciesPhotoFigure id={pick.id} name={pick.name} />
            <p className="font-serif text-base italic text-text-muted">{pick.explanation}</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="section-label pt-0.5">Rig</dt>
              <dd className="text-text">{pick.rig}</dd>
              <dt className="section-label pt-0.5">Hook</dt>
              <dd className="text-text">{pick.hook_size}</dd>
              <dt className="section-label pt-0.5">Sinker</dt>
              <dd className="text-text">{pick.sinker}</dd>
              <dt className="section-label pt-0.5">Bait</dt>
              <dd className="text-text">{pick.bait}</dd>
              <dt className="section-label pt-0.5">Lures</dt>
              <dd className="text-text">{pick.lures}</dd>
              <dt className="section-label pt-0.5">Why</dt>
              <dd className="text-text-muted">{pick.reasons.join(' · ')}</dd>
              {pick.regulation && (
                <>
                  <dt className="section-label pt-0.5">Limits ({pick.regulation.state})</dt>
                  <dd className="flex flex-col gap-0.5 text-text">
                    <span>
                      {[
                        pick.regulation.min_size && `Min ${pick.regulation.min_size}`,
                        pick.regulation.bag_limit,
                        pick.regulation.season,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {pick.regulation.notes && (
                      <span className="text-text-muted">{pick.regulation.notes}</span>
                    )}
                    <span className="text-xs text-text-muted">
                      As of {formatAsOf(pick.regulation.as_of)}
                      {pick.regulation.possibly_outdated && ' — may be out of date'}
                      {pick.regulation.source_url && (
                        <>
                          {' · '}
                          <a
                            href={pick.regulation.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            Official {pick.regulation.state} rules
                          </a>
                        </>
                      )}
                    </span>
                  </dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">{guidance.disclaimer}</p>
    </>
  )
}

/**
 * Presentational rendering of a `ForecastEnvelope`, laid out like the
 * original Saltline dashboard and shared by both forecast pages:
 *
 * 1. "Today's forecast" -- the verdict as a big colored headline
 *    ("CHALLENGING · 42/100") over apps/api's plain-language summary in
 *    italic serif, then stat tiles for water temp, wind, waves (apps/api's
 *    already-reconciled ranges, shown verbatim) and confidence/freshness.
 * 2. "Fishing activity & day timeline" -- the tier-colored hourly chart.
 * 3. "When to fish" -- `deriveBestWindow`'s best window as a tile.
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
}: {
  forecast: ForecastEnvelope
  /** Nearby public live-cam links (lib/get-cams.ts). */
  cams?: NearbyCam[]
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
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="overflow-hidden p-0!">
        <div className="flex flex-col gap-1.5 px-5 pb-4 pt-5">
          <h2 className="section-label">Today&apos;s forecast</h2>
          <p
            className={cx(
              'text-[2rem] font-extrabold uppercase leading-none tracking-tight break-words sm:text-5xl',
              VERDICT_TEXT[verdict],
            )}
          >
            {verdict}
            {score && score.score !== null && (
              <>
                {' '}
                <span className="whitespace-nowrap">· {score.score}/100</span>
              </>
            )}
          </p>
          {forecast.conditions?.comfort?.over_limit && (
            <p className="w-fit rounded-md border border-marginal-border bg-marginal-bg px-2.5 py-1 text-xs font-semibold text-marginal-text">
              Over your comfort limits
              {score?.personalized_from && ` · ${score.personalized_from} for most anglers`}
            </p>
          )}
          {score?.summary && (
            <p className="font-serif text-base italic text-text-muted">{score.summary}</p>
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
                  ? `${conditions.wind_direction ? `${conditions.wind_direction} ` : ''}${formatRange(conditions.wind_range_kt)} kt`
                  : '—'
              }
              note={conditions?.wind_range_kt ? 'next 24 h' : 'unavailable'}
              rule="border-t-border"
            />
          </div>
          <div className="bg-surface">
            <StatTile
              label="Waves"
              value={conditions?.wave_range_ft ? `${formatRange(conditions.wave_range_ft)} ft` : '—'}
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

      {forecast.hourly_outlook && (
        <Card className="flex flex-col gap-4 border-t-2 border-t-tier-prime p-5!">
          <h2 className="section-label">Fishing activity &amp; day timeline</h2>
          <HourlyOutlookChart outlook={forecast.hourly_outlook} />
        </Card>
      )}

      {(bestWindow || forecast.hourly_outlook?.your_window) && (
        <Card className="flex flex-col gap-4 p-5!">
          <h2 className="section-label">When to fish</h2>
          <div className="flex flex-wrap justify-center gap-3">
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

      {forecast.recommendations && <WhatsBiting guidance={forecast.recommendations} />}

      <div className="flex min-w-0 flex-col border-b border-border">
        {forecast.recommendations?.pack && (
          <CollapsibleSection
            title="Pack for today"
            aside={
              <span className="font-serif text-sm italic text-text-muted">
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

        {forecast.recommendations && forecast.recommendations.species.length > 0 && (
          <CollapsibleSection title="Rigs & tips">
            <RigsAndTips guidance={forecast.recommendations} />
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
                  <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-primary">
                    {cam.cam_type} cam
                  </span>
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
          <CollapsibleSection title="Today's tides">
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
      </div>
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
