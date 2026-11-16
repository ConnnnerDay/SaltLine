/**
 * Client-side: make *locationId* the signed-in user's home spot
 * (`default_location_id`) if they don't have one yet, so their first
 * pick becomes the forecast "/" opens to, as in the original app's
 * setup wizard. Never overwrites an existing choice, and never blocks
 * navigation -- every failure is swallowed.
 */
export async function rememberHomeIfUnset(locationId: string): Promise<void> {
  try {
    const response = await fetch('/api/preferences')
    if (!response.ok) return
    const preferences = (await response.json()) as { default_location_id: string | null }
    if (preferences.default_location_id) return
    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_location_id: locationId }),
    })
  } catch {
    // Best-effort only.
  }
}
