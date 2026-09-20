/**
 * Validates a `?next=` redirect target from login/register (both reached
 * by an anonymous visitor bounced off a session-gated page, e.g.
 * app/locations/page.tsx's `redirect('/login?next=/locations')`).
 * `next` comes straight from the query string, so it's untrusted input:
 * a bare `startsWith('/')` alone still allows the classic open-redirect
 * trick `//evil.example.com` (browsers treat a leading `//` as
 * protocol-relative, i.e. off-site) -- this also rejects that, and
 * anything that isn't a same-origin relative path.
 */
export function safeRedirectTarget(next: string | null, fallback: string): string {
  if (!next) return fallback
  if (!next.startsWith('/') || next.startsWith('//')) return fallback
  return next
}
