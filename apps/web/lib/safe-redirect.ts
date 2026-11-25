/**
 * Validates a `?next=` redirect target from login/register/setup (reached
 * by a visitor bounced off a session-gated page, e.g.
 * app/locations/page.tsx's `redirect('/login?next=/locations')`).
 * `next` comes straight from the query string, so it's untrusted input.
 *
 * A bare `startsWith('/')` check is not enough: browsers read `//host`
 * as another site, and they also turn `\` into `/` and drop tabs and
 * newlines inside a URL, so `/\evil.example` and `/<tab>/evil.example`
 * both become `//evil.example`. So: reject backslashes and control
 * characters outright, then parse the path against a placeholder origin
 * and keep it only if it stays on that origin. Returns the normalized
 * path + query + hash.
 */
const PLACEHOLDER_ORIGIN = 'http://same-origin.invalid'

export function safeRedirectTarget(next: string | null, fallback: string): string {
  if (!next) return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback
  if (!next.startsWith('/') || next.startsWith('//')) return fallback
  let url: URL
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN)
  } catch {
    return fallback
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
