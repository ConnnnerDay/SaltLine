import { type NextRequest, NextResponse } from 'next/server'
import { internalApiFetch, InternalApiError } from '@/lib/internal-api-client'
import { requireSessionUserId } from '@/lib/require-session-user-id'

export const dynamic = 'force-dynamic'

export type SavedLocation = {
  id: number
  location_id: string
  name: string
  state: string
  lat: number
  lng: number
  saved_at: string
}

/**
 * Sprint 37's BFF proxy for `/v1/me/locations` -- same reason
 * app/api/preferences/route.ts exists (see lib/require-session-user-id.ts
 * for the auth check both share). `DELETE` lives in `[id]/route.ts`,
 * matching the REST shape apps/api's own router already uses
 * (`DELETE /v1/me/locations/{saved_location_id}`).
 */
export async function GET(): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId

  try {
    const locations = await internalApiFetch<SavedLocation[]>('/v1/me/locations', {
      userId,
    })
    return NextResponse.json(locations)
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    return NextResponse.json({ error: 'could not load saved locations' }, { status })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId

  const body = await request.json()

  try {
    const saved = await internalApiFetch<SavedLocation>('/v1/me/locations', {
      method: 'POST',
      body,
      userId,
    })
    return NextResponse.json(saved, { status: 201 })
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    const message =
      status === 409
        ? 'that location is already saved'
        : status === 404
          ? 'unknown location'
          : 'could not save that location'
    return NextResponse.json({ error: message }, { status })
  }
}
