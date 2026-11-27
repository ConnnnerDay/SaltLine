import { NextResponse, type NextRequest } from 'next/server'
import { CLIENT_IP_HEADER, clientIp } from '@/lib/client-ip'
import { FixedWindow } from '@/lib/fixed-window'

/**
 * Abuse protection at the front of the app (Next.js "proxy", formerly
 * middleware). It does not stop a volumetric DDoS -- that needs a network
 * shield in front (Cloudflare, Vercel's firewall), see apps/web/README.md
 * "Abuse protection" -- but it keeps one client from running up the
 * app's expensive work:
 *
 * 1. Resolves a trustworthy client IP (lib/client-ip.ts) and passes it on
 *    in CLIENT_IP_HEADER, overwriting whatever the client sent; Better
 *    Auth's sign-in/sign-up limits read that header (lib/auth.ts).
 * 2. Caps request bodies to the app's own API routes (64 KB is far more
 *    than any form here sends) and refuses bodies of unknown length.
 * 3. Per-IP request limits, tightest where a request fans out to
 *    upstream weather/tide services: forecasts, spot lookups, fish pages.
 *    /api/auth is left to Better Auth's own per-route limits.
 */

const MAX_BODY_BYTES = 64 * 1024

const HEAVY = new FixedWindow(60, 60_000) // forecasts and lookups
const API = new FixedWindow(120, 60_000)
const PAGES = new FixedWindow(240, 60_000)
// Link prefetches: the Fish guide alone shows hundreds of links, and the
// router prefetches the visible ones. A prefetch only renders up to the
// route's loading boundary (no forecast assembly), so it gets its own,
// much larger allowance instead of counting as a heavy page view.
const PREFETCH = new FixedWindow(1000, 60_000)

function tierFor(path: string, prefetch: boolean): FixedWindow | null {
  if (path.startsWith('/api/auth/')) return null
  if (prefetch) return PREFETCH
  if (
    path.startsWith('/forecast/') ||
    path.startsWith('/share/') ||
    path.startsWith('/fish/') ||
    path.startsWith('/api/locations/')
  ) {
    return HEAVY
  }
  if (path.startsWith('/api/')) return API
  return PAGES
}

function tooMany(path: string, retryAfter: number): NextResponse {
  const headers = { 'Retry-After': String(retryAfter) }
  return path.startsWith('/api/')
    ? NextResponse.json({ error: 'too many requests' }, { status: 429, headers })
    : new NextResponse('Too many requests. Wait a minute and try again.', {
        status: 429,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      })
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const ip = clientIp(request.headers)

  if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const length = request.headers.get('content-length')
    if (length === null && request.headers.has('transfer-encoding')) {
      return NextResponse.json({ error: 'length required' }, { status: 411 })
    }
    if (length !== null && Number(length) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'request too large' }, { status: 413 })
    }
  }

  const tier = tierFor(path, request.headers.has('next-router-prefetch'))
  const wait = tier?.hit(`${ip}`)
  if (wait) return tooMany(path, wait)

  const headers = new Headers(request.headers)
  headers.set(CLIENT_IP_HEADER, ip)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Everything except build assets and static files.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js|map|txt|json)$).*)',
  ],
}
