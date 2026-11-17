import type { Preferences } from '@/app/api/preferences/route'
import { limitsFor } from '@/lib/fishing-style'
import { compassLabel, formatRange, VERDICT_TEXT, type ForecastEnvelope } from './forecast-card'
import { Moon, moonAge } from './sky'
import { WeatherIcon } from './weather-icon'
import { Card } from './ui'
import { cx } from './ui/cx'

/**
 * "Next few days": apps/api's per-day outlook (`conditions.days`, from
 * the NWS marine zone forecast -- usually 5 days), one tile per day, so
 * a user can pick the best day to go. Each tile: the verdict in its
 * color with the score as a meter, wind and seas, the moon in that day's
 * phase with the solunar rating, and the day's high/low tides (tide
 * predictions only cover the first few days). The best-scoring day (or
 * days, when tied) is outlined; for a signed-in user, days over their limits (or a typical
 * limit for the craft they fish from) are tagged.
 */

export type DayOutlook = {
  date: string
  label: string
  wind_range_kt: [number, number] | null
  wind_direction: string | null
  wave_range_ft: [number, number] | null
  score: number | null
  verdict: keyof typeof VERDICT_TEXT
  moon_phase: string
  illumination_pct: number
  solunar_rating: string
  tides: { time: string; kind: 'high' | 'low'; height_ft: number }[]
  high_f?: number | null
  low_f?: number | null
  sky?: string | null
  short_forecast?: string | null
  precip_pct?: number | null
}

const METER: Record<string, string> = {
  Excellent: 'bg-go-text',
  Good: 'bg-go-text',
  Fair: 'bg-marginal-text',
  Challenging: 'bg-accent',
  Poor: 'bg-danger-text',
  Unknown: 'bg-text-muted',
}

export function NextDays({
  forecast,
  profile = null,
}: {
  forecast: ForecastEnvelope
  profile?: Preferences | null
}) {
  const days = ((forecast.conditions as { days?: DayOutlook[] } | null)?.days ?? []).filter(
    (day) => day.score !== null || day.wind_range_kt || day.wave_range_ft,
  )
  if (days.length < 2) return null

  const timezone = forecast.location.timezone
  const tideTime = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  // The top score; tied days all get the tag ("Tied best"), and if every
  // day ties there is no best day to point out.
  const scores = days.map((day) => day.score).filter((score): score is number => score !== null)
  const topScore = scores.length ? Math.max(...scores) : null
  const topCount = days.filter((day) => day.score === topScore).length
  const hasBest = topScore !== null && topCount < days.length
  const limits = limitsFor(profile)
  const overLimit = (day: DayOutlook) =>
    Boolean(
      (limits.wind && day.wind_range_kt && day.wind_range_kt[1] > limits.wind.value) ||
        (limits.waves && day.wave_range_ft && day.wave_range_ft[1] > limits.waves.value),
    )

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Next few days</h2>
        <span className="text-xs text-text-muted">From the NWS marine forecast</span>
      </div>
      <ol className="no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 pt-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {days.map((day) => {
          const isBest = hasBest && day.score === topScore
          return (
            <li
              key={day.date}
              className={cx(
                'relative flex w-[64%] shrink-0 snap-start flex-col gap-2.5 rounded-md border bg-surface-raised p-3.5 sm:w-auto',
                isBest ? 'border-primary ring-1 ring-primary' : 'border-border',
              )}
            >
              <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
                <span className="font-bold text-text">{day.label}</span>
                <span className="text-xs text-text-muted">
                  {dateLabel.format(new Date(`${day.date}T12:00:00Z`))}
                </span>
              </div>
              {isBest && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-primary-contrast">
                  {topCount > 1 ? 'Tied best' : 'Best day'}
                </span>
              )}
              <div className="flex flex-col gap-1">
                <span className={cx('text-lg font-extrabold uppercase leading-none', VERDICT_TEXT[day.verdict])}>
                  {day.verdict}
                </span>
                {day.score !== null && (
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                      <span className={cx('block h-full rounded-full', METER[day.verdict])} style={{ width: `${day.score}%` }} />
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-text">{day.score}</span>
                  </span>
                )}
              </div>
              {day.short_forecast && (
                <div className="flex items-center gap-2" title={day.short_forecast}>
                  <WeatherIcon sky={day.sky} className="h-7 w-7" />
                  <span className="flex flex-col text-xs leading-tight">
                    <span className="font-semibold tabular-nums text-text">
                      {day.high_f != null ? `${Math.round(day.high_f)}°` : '—'}
                      <span className="font-normal text-text-muted">
                        {' / '}
                        {day.low_f != null ? `${Math.round(day.low_f)}°` : '—'}
                      </span>
                    </span>
                    <span className="line-clamp-1 text-text-muted">
                      {day.precip_pct ? `${day.precip_pct}% rain` : day.short_forecast}
                    </span>
                  </span>
                </div>
              )}
              <dl className="flex flex-col gap-0.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Wind</dt>
                  <dd className="whitespace-nowrap text-right font-semibold tabular-nums text-text">
                    {day.wind_range_kt
                      ? `${day.wind_direction ? `${compassLabel(day.wind_direction)} ` : ''}${formatRange(day.wind_range_kt)} kt`
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Seas</dt>
                  <dd className="whitespace-nowrap text-right font-semibold tabular-nums text-text">
                    {day.wave_range_ft ? `${formatRange(day.wave_range_ft, 0.5)} ft` : '—'}
                  </dd>
                </div>
              </dl>
              {overLimit(day) && (
                <span className="w-fit rounded-full bg-marginal-bg px-2 py-0.5 text-xs font-semibold text-marginal-text">
                  Over your limits
                </span>
              )}
              <div className="flex items-center gap-2 border-t border-border pt-2.5">
                <Moon ageDays={moonAge(day.moon_phase, day.illumination_pct)} className="h-7 w-7" />
                <span className="flex flex-col text-xs leading-tight">
                  <span className="font-semibold text-text">{day.moon_phase}</span>
                  <span className="text-text-muted">Solunar {day.solunar_rating.toLowerCase()}</span>
                </span>
              </div>
              {day.tides.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-xs tabular-nums text-text-muted">
                  {day.tides.map((tide) => (
                    <li key={tide.time} className="flex justify-between gap-2">
                      <span>{tide.kind === 'high' ? 'High' : 'Low'}</span>
                      <span className="text-text">{tideTime.format(new Date(tide.time))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
