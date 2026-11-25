/** Shared helpers for the regulations snapshot (apps/api's `Regulation`). */

/** apps/api's read of a regulation's season for this month. */
export type SeasonStatus = 'open' | 'closed' | 'release_only' | 'prohibited' | 'check'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-04" -> "Apr 2026" (the regulations snapshot month). */
export function formatAsOf(asOf: string): string {
  const [year, month] = asOf.split('-').map(Number)
  if (!year || !month || month > 12) return asOf
  return `${MONTHS[month - 1]} ${year}`
}
