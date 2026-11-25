/** Shared types and labels for the Fish guide (app/fish), from apps/api's
 * `/v1/species` (the same catalogue "What's biting" ranks). */

export type FishSummary = {
  id: string
  name: string
  regions: string[]
  access: 'shore' | 'boat' | 'tidal' | 'incidental' | 'protected'
  temp_min: number
  temp_max: number
  temp_ideal_low: number
  temp_ideal_high: number
  peak_months: number[]
  good_months: number[]
  /** Peak/good months for regions where the timing differs from the above
   * (apps/api's regional_seasons.json). */
  season_by_region?: Record<string, { peak_months: number[]; good_months: number[] }>
  targets: string[]
  /** When and at what water temperature it spawns (not every fish has it). */
  spawn?: { months: number[]; temp_low: number; temp_high: number; note: string } | null
}

export type FishRegulation = {
  state: string
  min_size: string | null
  bag_limit: string | null
  season: string | null
  notes: string | null
  source_url: string | null
  as_of: string
  possibly_outdated: boolean
  closed_now?: boolean
}

export type FishDetail = FishSummary & {
  bait: string
  rig: string
  hook_size: string
  sinker: string
  lures: string
  explanation_cold: string
  explanation_warm: string
  conditions: string[]
  regulations: FishRegulation[]
}

/** apps/api's `conditions_region` keys, in coast order. */
export const REGIONS: { key: string; label: string }[] = [
  { key: 'atlantic_north', label: 'Northeast' },
  { key: 'atlantic_mid', label: 'Mid-Atlantic' },
  { key: 'atlantic_south', label: 'Southeast' },
  { key: 'gulf', label: 'Gulf' },
  { key: 'pacific', label: 'Pacific (central CA–WA)' },
  { key: 'pacific_south', label: 'Southern California' },
  { key: 'hawaii_conditions', label: 'Hawaii' },
]

export const REGION_LABEL: Record<string, string> = Object.fromEntries(
  REGIONS.map((region) => [region.key, region.label]),
)

export const ACCESS_LABEL: Record<FishSummary['access'], string> = {
  shore: 'Shore & pier',
  boat: 'Boat',
  tidal: 'Freshwater & brackish',
  incidental: 'Bait / non-target',
  protected: 'Protected — release',
}

export const TARGET_LABEL: Record<string, string> = {
  bottom: 'Bottom fish',
  inshore_slam: 'Inshore slam',
  pelagic: 'Fast mover',
  structure: 'Structure fish',
  gamefish: 'Big gamefish',
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** A fish's peak/good months, for one region when it has its own. */
export function monthsFor(fish: FishSummary, region?: string | null): { peak_months: number[]; good_months: number[] } {
  return (region && fish.season_by_region?.[region]) || fish
}

export function seasonOf(fish: FishSummary, month: number, region?: string | null): 'peak' | 'good' | 'off' {
  const { peak_months, good_months } = monthsFor(fish, region)
  return peak_months.includes(month) ? 'peak' : good_months.includes(month) ? 'good' : 'off'
}

export function spawningIn(fish: FishSummary, month: number): boolean {
  return Boolean(fish.spawn?.months.includes(month))
}

/** Months as ranges: "Aug–Nov", across the new year "Dec–Feb", and split
 * seasons as "Mar–May, Sep–Nov". */
export function monthSpan(months: number[]): string {
  const sorted = [...new Set(months)].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  if (sorted.length === 12) return 'All year'
  const short = (m: number) => MONTH_NAMES[m - 1].slice(0, 3)
  // Runs of consecutive months; a run ending in December joins one
  // starting in January.
  const runs: number[][] = []
  for (const m of sorted) {
    const last = runs[runs.length - 1]
    if (last && m === last[last.length - 1] + 1) last.push(m)
    else runs.push([m])
  }
  if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1].at(-1) === 12) {
    runs[0] = [...runs.pop()!, ...runs[0]]
  }
  return runs
    .map((run) => (run.length === 1 ? short(run[0]) : `${short(run[0])}–${short(run[run.length - 1])}`))
    .join(', ')
}
