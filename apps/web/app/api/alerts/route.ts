import { headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { internalApiFetch, InternalApiError } from '@/lib/internal-api-client'
import { requireSessionUserId } from '@/lib/require-session-user-id'

export const dynamic = 'force-dynamic'

export type AlertRule = {
  id: number
  location_id: string
  location_name: string
  min_verdict: 'Good' | 'Excellent'
  email: string
  enabled: boolean
  last_sent_on: string | null
}

export type Alerts = { email_configured: boolean; rules: AlertRule[] }

/** BFF proxy for apps/api's `/v1/me/alerts` (restored email alerts). */
export async function GET(): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId
  try {
    return NextResponse.json(await internalApiFetch<Alerts>('/v1/me/alerts', { userId }))
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    return NextResponse.json({ error: 'could not load alerts' }, { status })
  }
}

/** Create or update the alert for one spot. The address is always the
 * signed-in account's own email, read from the session here -- never
 * taken from the request body, so nobody can aim alerts at someone else. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId
  const session = await auth.api.getSession({ headers: await headers() })
  const email = session?.user.email
  if (!email) {
    return NextResponse.json({ error: 'your account has no email address' }, { status: 400 })
  }
  const body = (await request.json()) as { location_id?: string; min_verdict?: string }
  try {
    const rule = await internalApiFetch<AlertRule>('/v1/me/alerts', {
      method: 'PUT',
      body: { location_id: body.location_id, min_verdict: body.min_verdict, email },
      userId,
    })
    return NextResponse.json(rule)
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    return NextResponse.json({ error: 'could not save that alert' }, { status })
  }
}
