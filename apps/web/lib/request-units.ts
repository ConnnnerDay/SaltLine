import { cache } from 'react'
import type { Units } from './units'

/**
 * The signed-in reader's display units for the current request. A page
 * sets it once from their profile (`setRequestUnits`); any Server
 * Component rendered for that request reads it (`requestUnits`) instead
 * of every component threading a `units` prop. React's `cache` scopes the
 * store to one request, so readers never see another user's setting.
 * Defaults to imperial (e.g. the public share page). Client Components
 * can't read this; pass them `units` as a prop.
 */
const store = cache((): { units: Units } => ({ units: 'imperial' }))

export function setRequestUnits(units: Units | null | undefined): void {
  store().units = units === 'metric' ? 'metric' : 'imperial'
}

export function requestUnits(): Units {
  return store().units
}
