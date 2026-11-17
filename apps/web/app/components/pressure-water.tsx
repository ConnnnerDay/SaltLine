import type { ForecastEnvelope } from './forecast-card'
import { Card } from './ui'
import { cx } from './ui/cx'

/**
 * "Pressure & water temperature": two slow-moving signals anglers read
 * for the bite, from apps/api's `conditions`:
 *
 * - Barometer (`weather.barometer`): pressure at the nearest NWS
 *   observation station, its 3-hour change and trend, and the last 24
 *   hours as a line -- with what that trend usually means for fishing.
 * - Water temperature vs normal (`water_temp_normals_f`): today's reading
 *   on the spot's month-by-month average curve, and how far off normal
 *   it is for this month.
 *
 * Both are single-series line charts (one color, the latest point
 * marked and labeled); the numbers are always also in text.
 */

type Barometer = {
  station_name: string
  latest_mb: number
  latest_at: string
  change_3h_mb: number | null
  trend: string
  history: { time: string; mb: number }[]
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function trendNote(trend: string, mb: number): string {
  if (trend.startsWith('falling')) {
    return 'Falling pressure usually comes ahead of a front, and fish often feed hard before it arrives. A good time to be out, if the weather stays safe.'
  }
  if (trend.startsWith('rising')) {
    return 'Rising pressure usually follows a front. Fish often slow down for a day or so: fish deeper and slower, with smaller baits.'
  }
  return mb >= 1020
    ? 'Steady high pressure: clear, settled weather. Fish can be finicky in bright sun, so early and late are best.'
    : 'Steady pressure: settled conditions. Fish tend to keep their usual patterns.'
}

function Line({
  points,
  highlightLast = true,
  className,
}: {
  points: [number, number][]
  highlightLast?: boolean
  className?: string
}) {
  // points are already in the 0..300 x 0..80 box.
  const d = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  return (
    <svg viewBox="0 0 300 90" aria-hidden="true" className={cx('h-auto w-full', className)}>
      <path d={`${d} L ${last[0]} 86 L ${points[0][0]} 86 Z`} className="fill-primary opacity-10" />
      <path d="M 0 86 H 300" strokeWidth={1} className="stroke-border" />
      <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" />
      {highlightLast && <circle cx={last[0]} cy={last[1]} r={4.5} strokeWidth={2} className="fill-primary stroke-surface" />}
    </svg>
  )
}

function scale(values: number[], pad: number): (value: number) => number {
  const min = Math.min(...values) - pad
  const max = Math.max(...values) + pad
  return (value) => 80 - ((value - min) / (max - min || 1)) * 70
}

function BarometerPanel({ barometer, timezone }: { barometer: Barometer; timezone: string }) {
  const history = barometer.history
  const times = history.map((point) => new Date(point.time).getTime())
  const y = scale(history.map((point) => point.mb), 1)
  const span = (times[times.length - 1] - times[0]) || 1
  const points = history.map((point, index): [number, number] => [
    6 + ((times[index] - times[0]) / span) * 288,
    y(point.mb),
  ])
  const change = barometer.change_3h_mb
  const falling = barometer.trend.startsWith('falling')
  const rising = barometer.trend.startsWith('rising')
  const at = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-text">Barometer</h3>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-bold tabular-nums text-text">{barometer.latest_mb.toFixed(1)}</span>
        <span className="text-sm text-text-muted">mb</span>
        <span
          className={cx(
            'flex items-center gap-1 text-sm font-semibold',
            falling ? 'text-primary' : rising ? 'text-marginal-text' : 'text-text-muted',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {falling ? <path d="M12 5v14M6 13l6 6 6-6" /> : rising ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
          </svg>
          {barometer.trend.charAt(0).toUpperCase() + barometer.trend.slice(1)}
          {change !== null && ` (${change > 0 ? '+' : ''}${change.toFixed(1)} mb in 3 h)`}
        </span>
      </p>
      {points.length > 1 && (
        <div>
          <Line points={points} />
          <div className="flex justify-between text-[0.6875rem] tabular-nums text-text-muted">
            <span>24 h ago</span>
            <span>
              low {Math.min(...history.map((point) => point.mb)).toFixed(1)} · high{' '}
              {Math.max(...history.map((point) => point.mb)).toFixed(1)} mb
            </span>
            <span>now</span>
          </div>
        </div>
      )}
      <p className="text-sm leading-relaxed text-text-muted">{trendNote(barometer.trend, barometer.latest_mb)}</p>
      <p className="text-xs text-text-muted">
        Last 24 hours at {barometer.station_name}, updated {at.format(new Date(barometer.latest_at))}
      </p>
    </section>
  )
}

function WaterPanel({
  normals,
  current,
  isFallback,
  month,
}: {
  normals: number[]
  current: number | null
  isFallback: boolean
  month: number
}) {
  const values = current !== null ? [...normals, current] : normals
  const y = scale(values, 2)
  const x = (index: number) => 12 + (index / 11) * 276
  const points = normals.map((value, index): [number, number] => [x(index), y(value)])
  const normal = normals[month - 1]
  const diff = current !== null && normal !== undefined ? current - normal : null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-text">Water temperature vs normal</h3>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-bold tabular-nums text-text">
          {current !== null ? `${current.toFixed(1)}°F` : '—'}
        </span>
        {diff !== null && !isFallback && (
          <span
            className={cx(
              'text-sm font-semibold',
              Math.abs(diff) < 1 ? 'text-text-muted' : diff > 0 ? 'text-accent' : 'text-primary',
            )}
          >
            {Math.abs(diff) < 1
              ? `About normal for ${MONTH_NAMES[month - 1]}`
              : `${Math.abs(diff).toFixed(0)}°F ${diff > 0 ? 'warmer' : 'cooler'} than normal for ${MONTH_NAMES[month - 1]}`}
          </span>
        )}
      </p>
      <div className="relative">
        <svg viewBox="0 0 300 90" aria-hidden="true" className="h-auto w-full">
          <path d="M 0 86 H 300" strokeWidth={1} className="stroke-border" />
          <path
            d={points.map(([px, py], index) => `${index ? 'L' : 'M'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            className="stroke-text-muted"
          />
          <path d={`M ${x(month - 1)} 4 V 86`} strokeWidth={1} className="stroke-border" />
          {current !== null && !isFallback && (
            <circle cx={x(month - 1)} cy={y(current)} r={5} strokeWidth={2} className="fill-accent stroke-surface" />
          )}
        </svg>
        <div aria-hidden="true" className="flex justify-between px-[2.5%] text-[0.6875rem] text-text-muted">
          {MONTHS.map((letter, index) => (
            <span key={index} className={cx(index === month - 1 && 'font-bold text-text')}>
              {letter}
            </span>
          ))}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-text-muted">
        {isFallback
          ? 'No live reading right now, so this is the monthly average.'
          : diff !== null && Math.abs(diff) >= 3
            ? diff > 0
              ? 'Warmer than usual: warm-water species may linger or arrive early.'
              : 'Cooler than usual: fish may run deeper and slower; downsize baits.'
            : 'Close to the usual for this time of year.'}
        <span className="ml-1 inline-flex items-center gap-1 text-xs">
          <span aria-hidden="true" className="inline-block h-0.5 w-3 bg-text-muted" /> monthly normal
        </span>
      </p>
    </section>
  )
}

export function PressureAndWater({ forecast, month }: { forecast: ForecastEnvelope; month: number }) {
  const conditions = (forecast.conditions ?? {}) as {
    weather?: { barometer?: Barometer | null } | null
    water_temp_normals_f?: number[]
    water_temperature?: { value: number; is_fallback: boolean } | null
  }
  const barometer = conditions.weather?.barometer ?? null
  const normals = conditions.water_temp_normals_f ?? []
  if (!barometer && normals.length !== 12) return null

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="section-label">Pressure &amp; water temperature</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {barometer && <BarometerPanel barometer={barometer} timezone={forecast.location.timezone} />}
        {normals.length === 12 && (
          <WaterPanel
            normals={normals}
            current={conditions.water_temperature?.value ?? null}
            isFallback={conditions.water_temperature?.is_fallback ?? true}
            month={month}
          />
        )}
      </div>
    </Card>
  )
}
