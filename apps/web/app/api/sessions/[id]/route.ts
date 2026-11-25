import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireSessionUserId } from '@/lib/require-session-user-id'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/**
 * Signs out one of your other devices. The browser only ever sees a
 * session's id; its token (what Better Auth's revoke needs) stays on the
 * server, looked up among *your own* sessions, so an id from someone
 * else's account matches nothing. Use sign-out for this device.
 */
export async function DELETE(_request: Request, { params }: Props): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId
  const { id } = await params
  const requestHeaders = await headers()

  const current = await auth.api.getSession({ headers: requestHeaders })
  if (current?.session.id === id) {
    return NextResponse.json({ error: 'use sign out for this device' }, { status: 400 })
  }
  const sessions = await auth.api.listSessions({ headers: requestHeaders })
  const target = sessions.find((session) => session.id === id)
  if (!target) return NextResponse.json({ error: 'no such session' }, { status: 404 })

  await auth.api.revokeSession({ body: { token: target.token }, headers: requestHeaders })
  return new NextResponse(null, { status: 204 })
}
