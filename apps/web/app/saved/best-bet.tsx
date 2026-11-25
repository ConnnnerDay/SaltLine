import Link from 'next/link'
import { Card } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import { VERDICT_TEXT, type ForecastEnvelope } from '@/app/components/forecast-card'
import type { DayOutlook } from '@/app/components/next-days'
import { localizeText, type Units } from '@/lib/units'

type Spot = { location_id: string; name: string; forecast: ForecastEnvelope | null }
type Window = { start: string; end: string; reasons: string[] }
type Day = DayOutlook & { best_window?: Window | null }

/**
 * "Best bet this week": across the angler's saved spots, the day and spot
 * with the best rating in the 5-day outlook (each forecast is already
 * rated for their main style and limits), and the best stretch of that
 * day from apps/api (`best_window`: dawn or dusk, with a tide turn or
 * feeding period). Ties go to the sooner day. Nothing shows without at
 * least one scored day.
 */
export function BestBet({ spots, units }: { spots: Spot[]; units: Units }) {
  const candidates = spots.flatMap((spot) =>
    ((spot.forecast?.conditions as { days?: Day[] } | null)?.days ?? [])
      .map((day, index) => ({ spot, day, index }))
      .filter(({ day }) => day.score !== null),
  )
  if (candidates.length === 0) return null
  const best = candidates.reduce((top, next) =>
    (next.day.score ?? 0) > (top.day.score ?? 0) ||
    ((next.day.score ?? 0) === (top.day.score ?? 0) && next.index < top.index)
      ? next
      : top,
  )
  const { spot, day, index } = best
  const timezone = spot.forecast?.location.timezone ?? 'UTC'
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' })
  const when = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : weekday.format(new Date(`${day.date}T12:00:00Z`))
  const style = (spot.forecast?.conditions?.score as { style?: string } | null | undefined)?.style
  const window = day.best_window ?? null

  return (
    <Card className="flex flex-col gap-2 border-primary/40">
      <h2 className="section-label">Best bet this week</h2>
      <p className="text-lg font-bold text-text">
        {when} at{' '}
        <Link href={`/forecast/${encodeURIComponent(spot.location_id)}`} className="no-underline hover:underline">
          {localizeText(spot.name, units)}
        </Link>
        {': '}
        <span className={cx('uppercase', VERDICT_TEXT[day.verdict])}>{day.verdict}</span>{' '}
        <span className="text-base font-semibold text-text-muted">{day.score}/100</span>
      </p>
      {window && (
        <p className="text-sm text-text">
          <span className="font-semibold">
            {clock.format(new Date(window.start))} – {clock.format(new Date(window.end))}
          </span>
          <span className="text-text-muted"> · {window.reasons.join(' · ')}</span>
        </p>
      )}
      <p className="text-xs text-text-muted">
        The best-rated day across your saved spots{style ? `, rated for ${style} fishing` : ''}.
        {spots.length < 2 && ' Save more spots to compare them.'}
      </p>
    </Card>
  )
}
