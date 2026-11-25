import { type NextRequest, NextResponse } from 'next/server'
import { internalApiFetch, InternalApiError } from '@/lib/internal-api-client'
import { requireSessionUserId } from '@/lib/require-session-user-id'

export const dynamic = 'force-dynamic'

export type CatchConditions = {
  water_temp_f: number | null
  water_temp_is_fallback: boolean | null
  wind_range_kt: [number, number] | null
  wind_direction: string | null
  wave_range_ft: [number, number] | null
  verdict: string | null
  score: number | null
  /** At the moment of the catch; absent on catches logged before these existed. */
  tide?: 'incoming' | 'outgoing' | null
  moon_phase?: string | null
  solunar?: 'major' | 'minor' | null
}

export type CatchEntry = {
  id: number
  location_id: string
  location_name: string
  /** The spot's IANA time zone (older API responses may omit it). */
  timezone?: string | null
  species: string
  caught_at: string
  length_in: number | null
  weight_lb: number | null
  kept: boolean
  bait: string | null
  notes: string | null
  conditions: CatchConditions | null
  created_at: string
}

/** BFF proxy for apps/api's `/v1/me/catches` (the restored catch log),
 * same session + Origin checks as app/api/saved-locations/route.ts. */
export async function GET(): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId
  try {
    return NextResponse.json(
      await internalApiFetch<CatchEntry[]>('/v1/me/catches', { userId }),
    )
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    return NextResponse.json({ error: 'could not load your catch log' }, { status })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId
  const body = await request.json()
  try {
    const saved = await internalApiFetch<CatchEntry>('/v1/me/catches', {
      method: 'POST',
      body,
      userId,
    })
    return NextResponse.json(saved, { status: 201 })
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    const message =
      status === 422
        ? 'check the entry: species is required, the time can’t be in the future, and length/weight must be realistic'
        : status === 404
          ? 'unknown location'
          : 'could not save that catch'
    return NextResponse.json({ error: message }, { status })
  }
}
