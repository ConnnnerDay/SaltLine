import { requestUnits } from '@/lib/request-units'
import { height, heightRange, speed, speedRange } from '@/lib/units'
import type { Preferences } from '@/app/api/preferences/route'
import {
  FISHING_TIMES,
  FISHING_TYPES,
  TARGET_GROUPS,
  TIDE_PREFERENCES,
} from '@/lib/profile-options'
import {
  limitsFor,
  TIDE_TIPS,
  tideNow,
  WATER_LABEL,
  watersFor,
  type Limit,
} from '@/lib/fishing-style'
import type { ForecastEnvelope } from './forecast-card'
import { SpotDiagram, SPOTS } from './spot-diagram'
import { Card } from './ui'
import { cx } from './ui/cx'

/**
 * "Your fishing today": the forecast read through the signed-in user's
 * fishing profile (preferences), shown only when they have one.
 *
 * - What we know about you: chips for how/what/when you fish, with an
 *   edit link, so the personalization is never a mystery.
 * - Today vs your limits: today's wind and wave ranges drawn against the
 *   user's comfort limits (or a typical limit for the kayak/boat they
 *   fish from), as a band on a scale with the limit marked.
 * - The tide right now, and whether it's their preferred tide.
 *
 * The where-to-fish guides (`WhereToFish`, below) live in "Rigs & tips".
 */

function hasProfile(profile: Preferences | null): profile is Preferences {
  return Boolean(
    profile &&
      (profile.fishing_types?.length ||
        profile.target_groups?.length ||
        profile.fishing_times?.length ||
        profile.tide_preference ||
        profile.wind_threshold_kt != null ||
        profile.surf_threshold_ft != null),
  )
}

const label = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value

function ProfileChips({ profile }: { profile: Preferences }) {
  const chips = [
    ...(profile.fishing_types ?? []).map((value) => label(FISHING_TYPES, value)),
    ...(profile.target_groups ?? []).map((value) => label(TARGET_GROUPS, value)),
    ...(profile.fishing_times ?? []).map((value) => label(FISHING_TIMES, value)),
    ...(profile.tide_preference
      ? [`${label(TIDE_PREFERENCES, profile.tide_preference)} tide`]
      : []),
  ]
  if (chips.length === 0) return null
  return (
    <ul aria-label="Your fishing profile" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip}
          className="rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs font-semibold text-text"
        >
          {chip}
        </li>
      ))}
    </ul>
  )
}


/** One "today vs your limit" row: a scale from 0, today's range as a
 * band (green up to the limit, red beyond it, the verdict also in words),
 * and the limit as a marked line. */
function LimitGauge({
  title,
  kind,
  range,
  limit,
}: {
  title: string
  kind: 'speed' | 'height'
  range: [number, number]
  limit: Limit
}) {
  const [low, high] = range
  const max = Math.max(limit.value * 1.6, high * 1.15, 1)
  const at = (value: number) => `${Math.min(100, (value / max) * 100)}%`
  // within: the whole range is at or under the limit; over: all of it is
  // at or above it; partly: the upper end crosses it.
  const state = high <= limit.value ? 'within' : low >= limit.value ? 'over' : 'partly'
  const whose = limit.source === 'Your limit' ? 'your limit' : 'the limit'
  const words = {
    within: `Within ${whose}`,
    partly: `Upper end over ${whose}`,
    over: `Over ${whose}`,
  }[state]
  const split = Math.min(Math.max(limit.value, low), high)
  const units = requestUnits()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold text-text">
          {title}{' '}
          <span className="font-bold tabular-nums">
            {kind === 'speed' ? speedRange(range, units) : heightRange(range, units)}
          </span>
        </span>
        <span
          className={cx(
            'text-xs font-bold',
            state === 'within' ? 'text-go-text' : state === 'partly' ? 'text-marginal-text' : 'text-danger-text',
          )}
        >
          {words}
        </span>
      </div>
      <div aria-hidden="true" className="relative h-7">
        <div className="absolute inset-x-0 top-2.5 h-2 rounded-full bg-border" />
        {/* Today's range: green up to the limit, red beyond it. */}
        {split > low && (
          <div
            className={cx('absolute top-2.5 h-2 rounded-l-full bg-go-text', high <= split && 'rounded-r-full')}
            style={{ left: at(low), width: `calc(${at(split)} - ${at(low)})` }}
          />
        )}
        {high > split && (
          <div
            className={cx('absolute top-2.5 h-2 rounded-r-full bg-danger-text', split <= low && 'rounded-l-full')}
            style={{ left: at(split), width: `max(0.5rem, calc(${at(high)} - ${at(split)}))` }}
          />
        )}
        {high <= limit.value && low === high && (
          <div className="absolute top-2.5 h-2 w-2 rounded-full bg-go-text" style={{ left: at(low) }} />
        )}
        <div className="absolute top-0 h-7 w-0.5 rounded-full bg-text" style={{ left: at(limit.value) }} />
      </div>
      <span className="text-xs text-text-muted">
        {limit.source}: {kind === 'speed' ? speed(limit.value, units) : height(limit.value, units, 1)}
      </span>
    </div>
  )
}

export function YourDay({
  forecast,
  profile,
}: {
  forecast: ForecastEnvelope
  profile: Preferences | null
}) {
  if (!hasProfile(profile)) return null

  const conditions = forecast.conditions
  const limits = limitsFor(profile)
  const tide = tideNow(forecast.tides)
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: forecast.location.timezone,
    hour: 'numeric',
    minute: '2-digit',
  })
  const preferred = profile.tide_preference
  const tideMatches =
    tide &&
    preferred &&
    (preferred === tide.direction ||
      (preferred === tide.next.kind && tide.minutesAway < 90))

  const gauges = [
    limits.wind && conditions?.wind_range_kt && (
      <LimitGauge key="wind" title="Wind" kind="speed" range={conditions.wind_range_kt} limit={limits.wind} />
    ),
    limits.waves && conditions?.wave_range_ft && (
      <LimitGauge key="waves" title="Waves" kind="height" range={conditions.wave_range_ft} limit={limits.waves} />
    ),
  ].filter(Boolean)

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Your fishing today</h2>
        <a href="/preferences" className="text-xs font-semibold">
          Edit your profile
        </a>
      </div>

      <ProfileChips profile={profile} />

      {(gauges.length > 0 || tide) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {gauges.length > 0 && (
            <section className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4">
              <h3 className="section-label">Today vs your limits</h3>
              {gauges}
            </section>
          )}
          {tide && (
            <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-4">
              <h3 className="section-label">Tide right now</h3>
              <p className="flex items-center gap-2.5 text-lg font-bold text-text">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary">
                  {tide.direction === 'incoming' ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
                </svg>
                {tide.direction === 'incoming' ? 'Coming in' : 'Going out'}
              </p>
              <p className="text-sm text-text-muted">
                {tide.next.kind === 'high' ? 'High' : 'Low'} tide at{' '}
                <span className="font-semibold text-text">
                  {timeFormatter.format(new Date(tide.next.time))}
                </span>{' '}
                ({height(tide.next.height_ft, requestUnits())})
              </p>
              {preferred && (
                <p
                  className={cx(
                    'w-fit rounded-full px-2.5 py-0.5 text-xs font-bold',
                    tideMatches ? 'bg-go-bg text-go-text' : 'bg-border text-text-muted',
                  )}
                >
                  {tideMatches
                    ? `Your ${label(TIDE_PREFERENCES, preferred).toLowerCase()} tide`
                    : `You prefer ${label(TIDE_PREFERENCES, preferred).toLowerCase()} tide`}
                </p>
              )}
            </section>
          )}
        </div>
      )}

    </Card>
  )
}

/**
 * "Where to fish": a cross-section of each kind of water the user fishes
 * (up to two) with numbered hotspots, the matching list, and what the
 * tide is doing on that water right now. Lives in the "Rigs & tips"
 * section, with the rest of the how-to content.
 */
export function WhereToFish({
  forecast,
  profile,
}: {
  forecast: ForecastEnvelope
  profile: Preferences | null
}) {
  const waters = watersFor(profile).slice(0, 2)
  if (waters.length === 0) return null
  const tide = tideNow(forecast.tides)
  return (
    <section className="flex flex-col gap-4">
      <h3 className="section-label">Where to fish</h3>
      <div className="flex flex-col gap-4">
      {waters.map((water) => (
        <section
          key={water}
          className="grid grid-cols-1 gap-4 rounded-md border border-border bg-surface-raised p-4 sm:p-5 md:grid-cols-[minmax(0,22rem)_1fr]"
        >
          <div className="self-start overflow-hidden rounded-md border border-border">
            <SpotDiagram water={water} className="block h-auto w-full" />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-lg font-bold text-text">
              {SPOTS[water].title}
              <span className="ml-2 text-xs font-semibold text-text-muted">{WATER_LABEL[water]}</span>
            </h3>
            <ul className="flex flex-col gap-2 text-sm text-text">
              {SPOTS[water].hotspots.map((spot, index) => (
                <li key={spot} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{spot}</span>
                </li>
              ))}
            </ul>
            {tide && (
              <p className="rounded-md border-l-4 border-l-primary bg-primary-tint px-3 py-2 text-sm text-text">
                <span className="font-semibold">Right now: </span>
                {TIDE_TIPS[water][tide.direction]}
              </p>
            )}
          </div>
        </section>
      ))}
      </div>
    </section>
  )
}
