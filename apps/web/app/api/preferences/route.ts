import { type NextRequest, NextResponse } from 'next/server'
import { internalApiFetch, InternalApiError } from '@/lib/internal-api-client'
import { requireSessionUserId } from '@/lib/require-session-user-id'

// Live per-request proxy -- a user's preferences are exactly the kind
// of per-request, per-session data force-dynamic exists for (matching
// app/forecast/[locationId]/page.tsx's own reasoning for the same
// config).
export const dynamic = 'force-dynamic'

export type Preferences = {
  units: 'imperial' | 'metric'
  fishing_style: string | null
  wind_threshold_kt: number | null
  surf_threshold_ft: number | null
  default_location_id: string | null
}

/**
 * Sprint 36's BFF proxy for `/v1/me/preferences` -- same reason
 * app/api/locations/search/route.ts exists: the browser never calls
 * apps/api directly (ADR-004), so this Route Handler is the one place
 * a Client Component's fetch can land. Unlike that route, every method
 * here requires a real Better Auth session -- see
 * lib/require-session-user-id.ts.
 */
export async function GET(): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId

  try {
    const preferences = await internalApiFetch<Preferences>('/v1/me/preferences', {
      userId,
    })
    return NextResponse.json(preferences)
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    return NextResponse.json({ error: 'could not load preferences' }, { status })
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId

  const body = await request.json()

  try {
    const preferences = await internalApiFetch<Preferences>('/v1/me/preferences', {
      method: 'PATCH',
      body,
      userId,
    })
    return NextResponse.json(preferences)
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    return NextResponse.json({ error: 'could not update preferences' }, { status })
  }
}
