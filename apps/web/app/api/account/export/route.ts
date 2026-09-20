import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { internalApiFetch } from '@/lib/internal-api-client'

// Live per-request proxy -- never cached, and never anything this app
// would want a CDN or browser to cache regardless (it's one account's
// full data export).
export const dynamic = 'force-dynamic'

type AccountExport = {
  preferences: {
    units: string
    fishing_style: string | null
    wind_threshold_kt: number | null
    surf_threshold_ft: number | null
    default_location_id: string | null
  } | null
  saved_locations: { location_id: string; saved_at: string }[]
}

/**
 * Sprint 45 ("Privacy and deletion")'s self-service data export --
 * required at v1 launch per the round-2 product decision, not deferred
 * with the rest of that sprint's row (real "legal pages" copy is the
 * one piece this session can't supply, needing real legal review).
 * Merges the two schemas ADR-006 splits between apps into one download:
 * `session.user`'s own account fields (email, name, when the account
 * was created -- never a password hash, which Better Auth's session
 * object never exposes here regardless) plus apps/api's
 * `GET /v1/me/export` for the `forecast`-schema half (preferences,
 * saved locations). A `Content-Disposition: attachment` header makes
 * this a real download from a plain link, not just JSON the browser
 * renders inline.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 })
  }

  let apiExport: AccountExport
  try {
    apiExport = await internalApiFetch<AccountExport>('/v1/me/export', {
      userId: session.user.id,
    })
  } catch {
    return NextResponse.json(
      { error: 'account export is temporarily unavailable' },
      { status: 502 },
    )
  }

  const exportData = {
    account: {
      email: session.user.email,
      name: session.user.name,
      created_at: session.user.createdAt,
    },
    ...apiExport,
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="saltline-account-data.json"',
    },
  })
}
