/**
 * The client's IP address for rate limiting, from a header clients can't
 * forge in the way this app is deployed. proxy.ts resolves it once per
 * request and passes it on as CLIENT_IP_HEADER (overwriting any value
 * the client sent), and Better Auth's limiter reads that header.
 *
 * Why not just `x-forwarded-for`: Next.js only fills it in from the
 * connection when the client didn't send one, so a client can put any
 * address there and get a fresh rate-limit allowance per request.
 *
 * - Behind a front proxy that *appends* the real address (nginx, Caddy,
 *   most load balancers) or *replaces* the header (Vercel): the
 *   rightmost `x-forwarded-for` entry is the address that proxy saw.
 * - Behind Cloudflare or a proxy that sets its own header: set
 *   SALTLINE_CLIENT_IP_HEADER (e.g. `cf-connecting-ip`, `x-real-ip`).
 * - Exposed to the internet with no front proxy at all: no header can be
 *   trusted. Put one in front (apps/web/README.md, "Abuse protection").
 */
export const CLIENT_IP_HEADER = 'x-saltline-client-ip'

const SOURCE_HEADER = process.env.SALTLINE_CLIENT_IP_HEADER?.trim().toLowerCase() || null

export function clientIp(headers: Headers): string {
  if (SOURCE_HEADER) {
    const value = headers.get(SOURCE_HEADER)?.split(',')[0]?.trim()
    if (value) return value
  }
  const forwarded = headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean)
  return forwarded?.at(-1) ?? 'unknown'
}
