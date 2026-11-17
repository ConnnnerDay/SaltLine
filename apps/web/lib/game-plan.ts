/**
 * "Today's game plan": the whole forecast boiled down to five concrete
 * steps -- when to go, where to cast, what to target, how to rig, and
 * what to watch -- composed from data the forecast already carries
 * (best/personal window, tide direction, picks, rigs, waves, wind
 * effect, alerts, warnings, barometer, multi-day outlook) and the
 * signed-in user's profile. Rule-based text, no model: every sentence
 * traces back to a field, and a step whose data is missing is left out
 * rather than guessed.
 */
import type { Preferences } from '@/app/api/preferences/route'
import {
  deriveBestWindow,
  formatBestWindowRange,
  type ForecastEnvelope,
  type SpeciesPick,
} from '@/app/components/forecast-card'
import { RIGS, rigsFor } from '@/lib/rigs'
import { limitsFor, tideNow, watersFor, type TideNow, type Water } from '@/lib/fishing-style'

export type PlanStep = {
  key: 'when' | 'where' | 'what' | 'rig' | 'watch'
  title: string
  text: string
}

const WHERE: Record<Water, Record<TideNow['direction'] | 'none', string>> = {
  surf: {
    incoming: 'the first trough, close to the beach: rising water pushes fish in',
    outgoing: 'the cuts in the bar and its outer edge, where draining water carries bait',
    none: 'the first trough between the beach and the bar',
  },
  pier: {
    incoming: 'the up-current side of the pilings, working out toward the end',
    outgoing: 'the down-current side of the pilings, where bait gets swept past',
    none: 'tight to the pilings, then the end of the pier for bigger fish',
  },
  jetty: {
    incoming: 'the channel side of the rocks as water floods in',
    outgoing: 'the tip and the inlet mouth, where the falling tide flushes bait out',
    none: 'the seam where the rocks meet the sand',
  },
  flats: {
    incoming: 'the grass edges, as rising water lets fish push in to feed',
    outgoing: 'creek mouths and the channel drop-off as the flat drains',
    none: 'oyster bars and the edge of the channel',
  },
  offshore: {
    incoming: 'the up-current edge of reefs and ledges',
    outgoing: 'the up-current edge of reefs and ledges',
    none: 'the up-current edge of reefs and ledges',
  },
}

const ROUGH = new Set(['Poor', 'Challenging'])

const TAG_RANK = { low: 0, med: 1, high: 2, prime: 3 } as const

function firstBait(pick: SpeciesPick): string {
  return pick.bait.split(/[;,]/)[0].trim().toLowerCase()
}

type Extras = {
  weather?: { barometer?: { trend: string } | null } | null
  wind_effect?: { relation: 'onshore' | 'offshore' | 'cross' | null } | null
  alerts?: { event: string }[] | null
  days?: { label: string; score: number | null; verdict: string }[]
}

export function buildGamePlan(
  forecast: ForecastEnvelope,
  profile: Preferences | null,
  now: Date,
): PlanStep[] {
  const conditions = forecast.conditions
  const extras = (conditions ?? {}) as Extras
  const timezone = forecast.location.timezone
  const steps: PlanStep[] = []

  // When.
  const verdict = conditions?.score?.verdict ?? 'Unknown'
  const todayScore = conditions?.score?.score ?? null
  const better = (extras.days ?? [])
    .slice(1)
    .filter((day) => day.score !== null && todayScore !== null && day.score >= todayScore + 10)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  const yours = forecast.hourly_outlook?.your_window
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
  const range = (start: string, end: string) =>
    start === end ? clock.format(new Date(start)) : `${clock.format(new Date(start))} – ${clock.format(new Date(end))}`
  const hours = forecast.hourly_outlook?.hours ?? []
  const best = forecast.hourly_outlook ? deriveBestWindow(forecast.hourly_outlook) : null
  const ended = (end: string) => new Date(end).getTime() + 3600_000 <= now.getTime()
  // The best stretch still ahead today: the highest tier among the
  // remaining hours, as one contiguous run.
  const upcoming = hours.filter((hour) => new Date(hour.time).getTime() + 3600_000 > now.getTime())
  const topRank = Math.max(-1, ...upcoming.map((hour) => TAG_RANK[hour.tag]))
  const run: typeof upcoming = []
  for (const hour of upcoming) {
    if (TAG_RANK[hour.tag] === topRank && (run.length === 0 || hour.hour === run[run.length - 1].hour + 1)) {
      run.push(hour)
    } else if (run.length) break
  }
  let windowText: string | null = null
  if (yours && !ended(yours.end)) {
    windowText = `Aim for ${range(yours.start, yours.end)} (your usual hours).`
  } else if (best && !ended(best.hours[best.hours.length - 1].time)) {
    windowText = `Aim for ${formatBestWindowRange(best, timezone)}.`
  } else if (run.length && topRank >= TAG_RANK.med) {
    const passed = best ? ` Today's best window (${formatBestWindowRange(best, timezone)}) has passed;` : ''
    windowText = `${passed} the best of what's left is ${range(run[0].time, run[run.length - 1].time)} (${run[0].tag === 'med' ? 'good' : run[0].tag}).`.trim()
    windowText = windowText.charAt(0).toUpperCase() + windowText.slice(1)
  } else if (best) {
    windowText = `Today's best window (${formatBestWindowRange(best, timezone)}) has passed; check tomorrow's forecast.`
  }
  if (windowText || better) {
    const parts: string[] = []
    if (windowText) parts.push(windowText)
    if (ROUGH.has(verdict) && better) {
      parts.push(`Today is ${verdict.toLowerCase()}; ${better.label} looks better (${better.verdict.toLowerCase()}, ${better.score}).`)
    }
    steps.push({ key: 'when', title: 'When', text: parts.join(' ') })
  }

  // Where.
  const water = watersFor(profile)[0] ?? 'surf'
  const tide = tideNow(forecast.tides, now)
  steps.push({
    key: 'where',
    title: 'Where',
    text: `Fish ${WHERE[water][tide?.direction ?? 'none']}.`,
  })

  // What + rig.
  const picks = forecast.recommendations?.species ?? []
  const target = picks.find((pick) => pick.matches_profile) ?? picks[0]
  if (target) {
    steps.push({
      key: 'what',
      title: 'Target',
      text: `${target.name}${target.matches_profile ? ' (one of your targets)' : ''} on ${firstBait(target)}.`,
    })
    const rigId = rigsFor(target.rig)[0]
    const waves = conditions?.wave_range_ft
    const sinkerNote =
      waves && waves[1] >= 4
        ? ' Surf is up, so go to the heavy end of that range.'
        : extras.wind_effect?.relation === 'cross'
          ? ' Wind along the shore means a side current, so go heavier.'
          : ''
    steps.push({
      key: 'rig',
      title: 'Rig',
      text: `${rigId ? RIGS[rigId].name : target.rig} with a ${target.hook_size} and a ${target.sinker}.${sinkerNote}`,
    })
  }

  // Watch out.
  const notes: string[] = []
  for (const alert of extras.alerts ?? []) notes.push(`${alert.event} in effect.`)
  if (forecast.warnings.some((warning) => warning.code === 'lightning_risk')) {
    notes.push('Thunderstorms possible: leave at the first rumble.')
  }
  if (conditions?.comfort?.over_limit) notes.push('Today is over your comfort limits.')
  else {
    const limits = limitsFor(profile)
    if (limits.wind && conditions?.wind_range_kt && conditions.wind_range_kt[1] > limits.wind.value) {
      notes.push(`Wind is past the ${limits.wind.source.toLowerCase()}.`)
    }
  }
  const trend = extras.weather?.barometer?.trend ?? ''
  if (trend.startsWith('falling')) notes.push('Pressure is falling: the bite often turns on ahead of a front.')
  if (trend.startsWith('rising')) notes.push('Pressure is rising after a front: fish slower and deeper.')
  steps.push({
    key: 'watch',
    title: 'Watch',
    text: notes.length ? notes.slice(0, 3).join(' ') : 'Nothing flagged: settled conditions.',
  })

  return steps
}
