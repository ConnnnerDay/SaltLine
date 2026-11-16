import { NextResponse } from 'next/server'
import { classifyApiFailure } from '@/lib/diagnose-api'
import { internalApiFetch } from '@/lib/internal-api-client'

export const dynamic = 'force-dynamic'

/**
 * Self-host diagnostics: `GET /api/health` reports whether apps/web can
 * make a *signed* call to apps/api (the path every forecast takes), and
 * if not, which of the common causes it is (`lib/diagnose-api.ts`). Uses
 * apps/api's location search, which needs no network or database, so a
 * failure here is always a web<->api wiring problem, never upstream
 * weather data. Returns no secrets: only a status category and a hint.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await internalApiFetch<unknown[]>('/v1/locations/search?q=beach')
    return NextResponse.json({ web: 'ok', api: 'ok' })
  } catch (err) {
    const { kind, hint } = classifyApiFailure(err)
    return NextResponse.json({ web: 'ok', api: kind, hint }, { status: 503 })
  }
}
