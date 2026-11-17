/**
 * Turning the signed-in user's fishing profile into forecast content:
 * which kind of water they fish (`waterFor`), the craft limits that
 * apply when they haven't set their own (`limitsFor`), what the tide is
 * doing right now for their kind of water (`tideNow`, `TIDE_TIPS`), and
 * which rigs suit how they fish (`RIG_FIT`, `RIG_WATER_TIPS`, used by
 * "Rigs & tips"). Pure functions over the forecast and profile, so both
 * server components and tests can use them.
 */
import type { Preferences } from '@/app/api/preferences/route'
import type { ForecastTides } from '@/app/components/forecast-card'
import type { RigId } from '@/lib/rigs'

/** The kinds of water the profile's fishing types fall into. */
export type Water = 'surf' | 'pier' | 'jetty' | 'flats' | 'offshore'

const WATER_OF_TYPE: Record<string, Water> = {
  surf: 'surf',
  pier: 'pier',
  bridge: 'pier',
  jetty: 'jetty',
  wade: 'flats',
  kayak: 'flats',
  inshore: 'flats',
  offshore: 'offshore',
}

export const WATER_LABEL: Record<Water, string> = {
  surf: 'Surf',
  pier: 'Pier & bridge',
  jetty: 'Jetty',
  flats: 'Flats & marsh',
  offshore: 'Offshore',
}

/** "Suits your pier fishing". */
export const WATER_NOUN: Record<Water, string> = {
  surf: 'surf',
  pier: 'pier',
  jetty: 'jetty',
  flats: 'flats',
  offshore: 'offshore',
}

/** "From the pier", used to introduce a water-specific tip. */
export const WATER_PHRASE: Record<Water, string> = {
  surf: 'In the surf',
  pier: 'From the pier',
  jetty: 'On the jetty',
  flats: 'On the flats',
  offshore: 'Offshore',
}

/** The user's kinds of water, in the order they listed their fishing types. */
export function watersFor(profile: Preferences | null): Water[] {
  const waters: Water[] = []
  for (const type of profile?.fishing_types ?? []) {
    const water = WATER_OF_TYPE[type]
    if (water && !waters.includes(water)) waters.push(water)
  }
  return waters
}

export type Limit = { value: number; source: string }

// Widely used rule-of-thumb limits for small craft, used only when the
// user hasn't set their own comfort limits.
const CRAFT_LIMITS: { type: string; label: string; wind: number; waves: number }[] = [
  { type: 'kayak', label: 'Typical kayak limit', wind: 10, waves: 2 },
  { type: 'inshore', label: 'Typical small-boat limit', wind: 15, waves: 3 },
  { type: 'offshore', label: 'Typical offshore-boat limit', wind: 20, waves: 5 },
]

/** The wind (kt) and wave (ft) limits to measure today against: the
 * user's own comfort limits, else the strictest typical limit for a
 * craft they fish from, else none. */
export function limitsFor(profile: Preferences | null): { wind: Limit | null; waves: Limit | null } {
  const craft = CRAFT_LIMITS.find((entry) => profile?.fishing_types?.includes(entry.type))
  return {
    wind:
      profile?.wind_threshold_kt != null
        ? { value: profile.wind_threshold_kt, source: 'Your limit' }
        : craft
          ? { value: craft.wind, source: craft.label }
          : null,
    waves:
      profile?.surf_threshold_ft != null
        ? { value: profile.surf_threshold_ft, source: 'Your limit' }
        : craft
          ? { value: craft.waves, source: craft.label }
          : null,
  }
}

export type TideNow = {
  direction: 'incoming' | 'outgoing'
  /** The next high (incoming) or low (outgoing). */
  next: { kind: 'high' | 'low'; time: string; height_ft: number }
  /** Minutes from *now* until `next`. */
  minutesAway: number
}

/** Whether the tide is coming in or going out at *now*, from the next
 * predicted high/low after it. */
export function tideNow(tides: ForecastTides | null, now: Date = new Date()): TideNow | null {
  const next = tides?.predictions
    .filter((prediction) => new Date(prediction.time).getTime() > now.getTime())
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())[0]
  if (!next) return null
  return {
    direction: next.kind === 'high' ? 'incoming' : 'outgoing',
    next,
    minutesAway: (new Date(next.time).getTime() - now.getTime()) / 60000,
  }
}

/** What the tide means right now on each kind of water. */
export const TIDE_TIPS: Record<Water, Record<TideNow['direction'], string>> = {
  surf: {
    incoming:
      'Rising water pushes fish into the first trough and the wash: fish close, often within 30 yards.',
    outgoing:
      'Falling water pulls bait out through cuts in the bar: fish the cuts and the outer edge of the bar.',
  },
  pier: {
    incoming:
      'Incoming water brings clean water along the pilings: fish the up-current side and work toward the end.',
    outgoing:
      'On the falling tide, fish hold on the down-current side of the pilings, where bait gets swept past.',
  },
  jetty: {
    incoming:
      'As water floods in, fish the inside (channel) side of the rocks, where bait rides the current in.',
    outgoing:
      'On the falling tide, work the tip and the inlet mouth, where bait is flushed out to waiting fish.',
  },
  flats: {
    incoming:
      'Rising water lets reds and trout push onto the flats and into the grass edges to feed.',
    outgoing:
      'Falling water drains the flats: fish creek mouths, drains and the channel drop-off as bait gets pulled out.',
  },
  offshore: {
    incoming: 'Offshore, current matters more than tide: set up on the up-current side of structure.',
    outgoing: 'Offshore, current matters more than tide: set up on the up-current side of structure.',
  },
}

/** Rigs that suit each kind of water, best first. */
export const RIG_FIT: Record<Water, RigId[]> = {
  surf: ['fish_finder', 'hi_lo', 'pompano'],
  pier: ['hi_lo', 'knocker', 'float', 'fish_finder'],
  jetty: ['knocker', 'jig', 'fish_finder'],
  flats: ['popping_cork', 'jig', 'float'],
  offshore: ['jig', 'hi_lo'],
}

/** A tip for fishing a rig on a particular kind of water. */
export const RIG_WATER_TIPS: Partial<Record<RigId, Partial<Record<Water, string>>>> = {
  fish_finder: {
    surf: 'Cast to the first trough or a cut in the bar; a sand spike keeps the line tight in the waves.',
    pier: 'Cast toward the surf line from the first third of the pier for drum and flounder.',
    jetty: 'Cast off the rocks onto the sand where they meet it; that seam holds flounder and drum.',
  },
  hi_lo: {
    surf: 'Small baits in the first trough: whiting, spot and croaker feed right at your feet.',
    pier: 'Drop it straight down between the pilings, or cast a short way off the side.',
    offshore: 'Over reefs and wrecks, drop it to the bottom and reel up a turn to stay out of snags.',
  },
  pompano: {
    surf: 'Fish the wash and the near trough where waves churn up sand fleas; moving, sandy water is best.',
  },
  knocker: {
    pier: 'Drop it tight to the pilings and keep the sinker touching the barnacles.',
    jetty: 'Lower it into gaps between the rocks; lift and drop to keep it from wedging.',
  },
  popping_cork: {
    flats: 'Drift or wade the grass edges and oyster bars, popping as you go.',
  },
  float: {
    pier: 'Fish it off the end of the pier, where Spanish mackerel and bluefish cruise.',
    flats: 'Drift a live shrimp under a float along the channel edge.',
  },
  jig: {
    jetty: 'Bounce it down the rocks into the current at the tip.',
    flats: 'Hop a paddle tail across the drop-off as the tide falls.',
    offshore: 'Drop it to the structure and jig just off the bottom.',
  },
}
