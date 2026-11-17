import type { ForecastEnvelope } from './forecast-card'
import { Card } from './ui'
import { cx } from './ui/cx'

/**
 * Two pieces built from data apps/api already computes in
 * `conditions` (astronomy is pure computation, so it is always there):
 *
 * - `WeatherAlerts`: NWS alerts for the spot (Small Craft Advisory,
 *   Gale Warning, Rip Current Statement...), shown first, colored by
 *   severity, with the full text one tap away. apps/api drops NWS test
 *   messages and cancellations before they get here.
 * - `SunAndMoon`: the daylight arc (sunrise to sunset, with the sun's
 *   position now), the moon drawn in its actual phase, and a 24-hour
 *   solunar bar with the major and minor feeding periods.
 *
 * Every time is shown in the location's own timezone.
 */

export type WeatherAlert = {
  event: string
  severity: string
  headline: string
  description: string
  expires?: string | null
}

type Period = { start: string; end: string }

export type SkyConditions = {
  sun_times?: { sunrise: string; sunset: string } | null
  twilight?: { civil_dawn: string; civil_dusk: string } | null
  lunar?: { moonrise: string; moonset: string; age_days: number } | null
  solunar?: {
    major_periods: Period[]
    minor_periods: Period[]
    moon_phase: string
    illumination_pct: number
    rating: string
  } | null
  alerts?: WeatherAlert[] | null
}

const SEVERITY_STYLE: Record<string, string> = {
  Extreme: 'border-nogo-border bg-nogo-bg text-nogo-text',
  Severe: 'border-nogo-border bg-nogo-bg text-nogo-text',
  Moderate: 'border-marginal-border bg-marginal-bg text-marginal-text',
}

function timeIn(timezone: string, iso: string, withDay = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    ...(withDay ? { weekday: 'short' } : {}),
  }).format(new Date(iso))
}

/** Hours since local midnight (0-24) of *iso* in *timezone*. */
function localHour(iso: string | Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(typeof iso === 'string' ? new Date(iso) : iso)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return get('hour') + get('minute') / 60
}

export function WeatherAlerts({ alerts, timezone }: { alerts: WeatherAlert[]; timezone: string }) {
  if (alerts.length === 0) return null
  return (
    <section aria-label="Weather alerts" className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <details
          key={`${alert.event}-${alert.headline}`}
          className={cx(
            'collapsible group rounded-lg border px-4 py-3 shadow-card',
            SEVERITY_STYLE[alert.severity] ?? 'border-primary/40 bg-primary-tint text-text',
          )}
        >
          <summary className="flex cursor-pointer items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-bold">
                {alert.event}
                {alert.expires && (
                  <span className="font-semibold opacity-80"> · until {timeIn(timezone, alert.expires, true)}</span>
                )}
              </span>
              <span className="text-sm opacity-90">{alert.headline}</span>
            </span>
            <span className="mt-1 shrink-0 text-xs font-semibold underline-offset-2 group-open:hidden">
              Details
            </span>
          </summary>
          {alert.description && (
            <p className="mt-3 whitespace-pre-line break-words border-t border-current/20 pt-3 text-sm opacity-90">
              {alert.description}
            </p>
          )}
        </details>
      ))}
    </section>
  )
}

/** The lit part of the moon for *ageDays* into the cycle, as an SVG path
 * (northern-hemisphere view: waxing lit on the right, waning on the
 * left). The terminator is a half-ellipse whose width shrinks to zero at
 * the quarters. */
function moonPath(ageDays: number, cx: number, cy: number, r: number): string | null {
  const cycle = 29.530588
  const angle = ((ageDays % cycle) / cycle) * 2 * Math.PI
  const lit = (1 - Math.cos(angle)) / 2
  if (lit < 0.02) return null
  if (lit > 0.98) return `M ${cx} ${cy - r} a ${r} ${r} 0 1 1 0 ${2 * r} a ${r} ${r} 0 1 1 0 ${-2 * r} Z`
  const waxing = angle < Math.PI
  const rx = Math.abs(Math.cos(angle)) * r
  const gibbous = lit > 0.5
  const limbSweep = waxing ? 1 : 0
  // From the bottom back to the top: a crescent's terminator bulges
  // toward the lit side, a gibbous moon's away from it.
  const terminatorSweep = waxing === gibbous ? 1 : 0
  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 0 ${limbSweep} ${cx} ${cy + r}`,
    `A ${rx} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r}`,
    'Z',
  ].join(' ')
}

function Moon({ ageDays }: { ageDays: number }) {
  const lit = moonPath(ageDays, 40, 40, 32)
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" className="h-20 w-20 shrink-0">
      <circle cx={40} cy={40} r={32} className="fill-border" />
      {lit && <path d={lit} className="fill-[#f1ead2]" />}
      <circle cx={40} cy={40} r={32} fill="none" strokeWidth={1} className="stroke-text-muted/40" />
    </svg>
  )
}

function DaylightArc({
  sunrise,
  sunset,
  timezone,
  now,
}: {
  sunrise: string
  sunset: string
  timezone: string
  now: Date
}) {
  const rise = new Date(sunrise).getTime()
  const set = new Date(sunset).getTime()
  const progress = (now.getTime() - rise) / (set - rise)
  const up = progress >= 0 && progress <= 1
  // Semicircle from (30,100) to (210,100): radius 90, centered at (120,100).
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, progress)))
  const sunX = 120 + 90 * Math.cos(angle)
  const sunY = 100 - 90 * Math.sin(angle)
  const daylight = (set - rise) / 3600000
  const hours = Math.floor(daylight)
  const minutes = Math.round((daylight - hours) * 60)

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox="0 0 240 124" aria-hidden="true" className="h-auto w-full max-w-xs">
        <path d="M 30 100 A 90 90 0 0 1 210 100" fill="none" strokeWidth={2} strokeDasharray="3 5" strokeLinecap="round" className="stroke-text-muted/60" />
        {up && (
          <path
            d={`M 30 100 A 90 90 0 0 1 ${sunX.toFixed(1)} ${sunY.toFixed(1)}`}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            className="stroke-amber"
          />
        )}
        <path d="M 6 100 H 234" strokeWidth={1.5} className="stroke-border" />
        {up ? (
          <circle cx={sunX} cy={sunY} r={9} strokeWidth={3} className="fill-amber stroke-surface" />
        ) : (
          <circle cx={progress < 0 ? 30 : 210} cy={100} r={6} className="fill-text-muted" />
        )}
        <text x={30} y={118} textAnchor="middle" className="fill-text-muted text-[11px] font-semibold">
          {timeIn(timezone, sunrise)}
        </text>
        <text x={210} y={118} textAnchor="middle" className="fill-text-muted text-[11px] font-semibold">
          {timeIn(timezone, sunset)}
        </text>
      </svg>
      <p className="text-sm text-text-muted">
        <span className="font-semibold text-text">
          {hours} h {minutes} min
        </span>{' '}
        of daylight · {up ? 'sun is up' : progress < 0 ? 'before sunrise' : 'after sunset'}
      </p>
    </div>
  )
}

/** Splits a period that wraps past midnight into same-day segments. */
function segments(period: Period, timezone: string): [number, number][] {
  const start = localHour(period.start, timezone)
  const end = localHour(period.end, timezone)
  return end > start ? [[start, end]] : [[start, 24], [0, end]]
}

function SolunarBar({
  solunar,
  sunrise,
  sunset,
  timezone,
  now,
}: {
  solunar: NonNullable<SkyConditions['solunar']>
  sunrise?: string
  sunset?: string
  timezone: string
  now: Date
}) {
  const pct = (hour: number) => `${(hour / 24) * 100}%`
  const nowHour = localHour(now, timezone)
  const rise = sunrise ? localHour(sunrise, timezone) : null
  const set = sunset ? localHour(sunset, timezone) : null

  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden="true" className="relative h-9 overflow-hidden rounded-md bg-surface-raised">
        {/* Night shading outside sunrise..sunset. */}
        {rise !== null && <div className="absolute inset-y-0 left-0 bg-bg/70" style={{ width: pct(rise) }} />}
        {set !== null && <div className="absolute inset-y-0 right-0 bg-bg/70" style={{ left: pct(set) }} />}
        {solunar.minor_periods.flatMap((period) =>
          segments(period, timezone).map(([start, end]) => (
            <div
              key={`minor-${period.start}-${start}`}
              className="absolute inset-y-2 rounded bg-tier-high/70"
              style={{ left: pct(start), width: pct(end - start) }}
            />
          )),
        )}
        {solunar.major_periods.flatMap((period) =>
          segments(period, timezone).map(([start, end]) => (
            <div
              key={`major-${period.start}-${start}`}
              className="absolute inset-y-1 rounded bg-tier-prime"
              style={{ left: pct(start), width: pct(end - start) }}
            />
          )),
        )}
        <div className="absolute inset-y-0 w-0.5 bg-text" style={{ left: pct(nowHour) }} />
      </div>
      <div aria-hidden="true" className="relative h-4 text-xs tabular-nums text-text-muted">
        {[0, 6, 12, 18].map((hour) => (
          <span key={hour} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: pct(hour) }}>
            {['12a', '6a', '12p', '6p'][hour / 6]}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {[
          ...solunar.major_periods.map((period) => ({ period, kind: 'Major' })),
          ...solunar.minor_periods.map((period) => ({ period, kind: 'Minor' })),
        ]
          .sort((a, b) => new Date(a.period.start).getTime() - new Date(b.period.start).getTime())
          .map(({ period, kind }) => (
            <li key={`${kind}-${period.start}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cx('h-2.5 w-2.5 rounded-sm', kind === 'Major' ? 'bg-tier-prime' : 'bg-tier-high/70')}
              />
              <span className="w-12 font-semibold text-text">{kind}</span>
              <span className="tabular-nums text-text-muted">
                {timeIn(timezone, period.start)} – {timeIn(timezone, period.end)}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}

export function SunAndMoon({ forecast, now }: { forecast: ForecastEnvelope; now: Date }) {
  const sky = (forecast.conditions ?? {}) as SkyConditions
  const timezone = forecast.location.timezone
  if (!sky.sun_times && !sky.solunar) return null

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Sun &amp; moon</h2>
        {sky.solunar && (
          <span className="text-xs text-text-muted">
            Solunar rating:{' '}
            <span className="font-bold text-text">{sky.solunar.rating}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {sky.sun_times && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text">Daylight</h3>
            <DaylightArc
              sunrise={sky.sun_times.sunrise}
              sunset={sky.sun_times.sunset}
              timezone={timezone}
              now={now}
            />
            {sky.twilight && (
              <p className="text-xs text-text-muted">
                First light {timeIn(timezone, sky.twilight.civil_dawn)} · last light{' '}
                {timeIn(timezone, sky.twilight.civil_dusk)}
              </p>
            )}
          </section>
        )}

        {sky.solunar && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text">Moon</h3>
            <div className="flex items-center gap-4">
              {sky.lunar && <Moon ageDays={sky.lunar.age_days} />}
              <div className="flex flex-col gap-0.5">
                <span className="text-lg font-bold text-text">{sky.solunar.moon_phase}</span>
                <span className="text-sm text-text-muted">
                  {Math.round(sky.solunar.illumination_pct)}% lit
                  {sky.lunar && ` · day ${Math.round(sky.lunar.age_days)} of 29`}
                </span>
                {sky.lunar && (
                  <span className="text-xs text-text-muted">
                    Rises {timeIn(timezone, sky.lunar.moonrise)} · sets {timeIn(timezone, sky.lunar.moonset)}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-text-muted">
              Bright moons light up night feeding; new and full moons bring the strongest tides.
            </p>
          </section>
        )}

        {sky.solunar && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text">Solunar feeding periods</h3>
            <SolunarBar
              solunar={sky.solunar}
              sunrise={sky.sun_times?.sunrise}
              sunset={sky.sun_times?.sunset}
              timezone={timezone}
              now={now}
            />
          </section>
        )}
      </div>
    </Card>
  )
}
