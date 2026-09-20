import { NextResponse } from 'next/server'
import { internalApiFetch, InternalApiError } from '@/lib/internal-api-client'
import { requireSessionUserId } from '@/lib/require-session-user-id'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Props): Promise<NextResponse> {
  const userId = await requireSessionUserId()
  if (typeof userId !== 'string') return userId

  const { id } = await params

  try {
    await internalApiFetch<void>(`/v1/me/locations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      userId,
    })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const status = err instanceof InternalApiError ? err.status : 502
    return NextResponse.json({ error: 'could not remove that location' }, { status })
  }
}
