import { internalApiFetch } from './internal-api-client'

type PreferencesSlice = { default_location_id: string | null }
type SavedLocationSlice = { location_id: string }

/**
 * The signed-in user's "home" spot, for the logged-in landing redirect
 * (app/page.tsx): their preferences' `default_location_id`, else the
 * first saved location, else `null` (send them to search). Best-effort:
 * any apps/api failure also yields `null`, so a backend hiccup degrades
 * to the search page instead of breaking the home page.
 */
export async function homeLocationId(userId: string): Promise<string | null> {
  try {
    const preferences = await internalApiFetch<PreferencesSlice>('/v1/me/preferences', {
      userId,
    })
    if (preferences.default_location_id) return preferences.default_location_id

    const saved = await internalApiFetch<SavedLocationSlice[]>('/v1/me/locations', { userId })
    return saved[0]?.location_id ?? null
  } catch {
    return null
  }
}
