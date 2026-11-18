/** Shared types and labels for the Fish guide (app/fish), from apps/api's
 * `/v1/species` (the same catalogue "What's biting" ranks). */

export type FishSummary = {
  id: string
  name: string
  regions: string[]
  access: 'shore' | 'boat' | 'tidal' | 'incidental'
  temp_min: number
  temp_max: number
  temp_ideal_low: number
  temp_ideal_high: number
  peak_months: number[]
  good_months: number[]
  targets: string[]
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
  tidal: 'Tidal creeks',
  incidental: 'Bait / non-target',
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

export function seasonOf(fish: FishSummary, month: number): 'peak' | 'good' | 'off' {
  return fish.peak_months.includes(month) ? 'peak' : fish.good_months.includes(month) ? 'good' : 'off'
}
