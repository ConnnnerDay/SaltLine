/** Fishing-profile choices shared by the setup wizard (app/onboarding)
 * and the Preferences page. Values match apps/api's preference enums. */

export type Gear = 'yes' | 'sometimes' | 'no'

export const FISHING_TYPES: { value: string; label: string }[] = [
  { value: 'surf', label: 'Surf' },
  { value: 'pier', label: 'Pier' },
  { value: 'jetty', label: 'Jetty' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'wade', label: 'Wade' },
  { value: 'kayak', label: 'Kayak' },
  { value: 'inshore', label: 'Inshore boat' },
  { value: 'offshore', label: 'Offshore boat' },
]

/** The original app's condition-tolerance presets, as comfort limits. */
export const COMFORT_PRESETS = [
  { value: 'calm', label: 'Calm days only', wind: 10, surf: 2 },
  { value: 'moderate', label: 'Some chop is fine', wind: 15, surf: 4 },
  { value: 'rough', label: "I'll fish rough water", wind: 25, surf: 7 },
] as const

/** The original profile's "What are you mostly fishing for?" groups. */
export const TARGET_GROUPS: { value: string; label: string; examples: string }[] = [
  { value: 'bottom', label: 'Bottom fish', examples: 'drum, whiting, flounder, pompano' },
  { value: 'inshore_slam', label: 'Inshore slam', examples: 'red drum, trout, flounder, snook' },
  { value: 'pelagic', label: 'Fast movers', examples: 'bluefish, mackerel, jacks' },
  { value: 'structure', label: 'Structure fish', examples: 'sheepshead, tautog, rockfish' },
  { value: 'gamefish', label: 'Big gamefish', examples: 'snook, ulua, sharks' },
]

export const FISHING_TIMES: { value: string; label: string }[] = [
  { value: 'dawn', label: 'Dawn' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
]

export const TIDE_PREFERENCES: { value: string; label: string }[] = [
  { value: 'incoming', label: 'Incoming' },
  { value: 'outgoing', label: 'Outgoing' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
]
