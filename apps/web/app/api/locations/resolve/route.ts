import { headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { internalApiFetch, InternalApiError } from '@/lib/internal-api-client'

// Live per-request proxy -- never cached.
export const dynamic = 'force-dynamic'

export type ResolvedLocation = {
  id: string
  name: string
  state: string
  lat: number
  lng: number
  timezone: string
  is_dynamic: boolean
}

/**
 * Sprint 31's device-geolocation piece, the natural next sub-item after
 * text search (map search and station-preview/ambiguity states stay
 * deliberately not attempted -- each is its own sizeable UI, and this
 * one apps/api endpoint already existed and needed no backend work).
 * BFF proxy for apps/api's `POST /v1/locations/resolve` with a raw
 * `lat`/`lng` point -- the browser's own `navigator.geolocation` result,
 * never a curated `location_id` (that path is `/api/locations/search`'s
 * job). Same session-gating reasoning as that route: `app/locations/
 * page.tsx` already redirects an anonymous visitor before this could be
 * reached through the UI, but this route needs its own check so a
 * direct `fetch('/api/locations/resolve', ...)` can't bypass it.
 *
 * apps/api's `resolve` accepts a curated id *or* a lat/lng point in one
 * request body shape (`LocationResolveRequest`'s `model_validator`
 * enforces exactly one); this route only ever sends the point shape --
 * a curated id has no reason to round-trip through geolocation.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const lat = typeof body?.lat === 'number' ? body.lat : null
  const lng = typeof body?.lng === 'number' ? body.lng : null
  if (lat === null || lng === null) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  try {
    const resolved = await internalApiFetch<ResolvedLocation>('/v1/locations/resolve', {
      method: 'POST',
      body: { lat, lng },
      userId: session.user.id,
    })
    return NextResponse.json(resolved)
  } catch (err) {
    if (err instanceof InternalApiError && err.status === 422) {
      return NextResponse.json({ error: 'that point is out of range' }, { status: 422 })
    }
    return NextResponse.json(
      { error: 'location resolution is temporarily unavailable' },
      { status: 502 },
    )
  }
}
