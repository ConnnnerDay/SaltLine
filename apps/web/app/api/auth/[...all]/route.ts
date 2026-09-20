import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

/**
 * Better Auth's own catch-all route handler -- every /api/auth/* request
 * (sign-in, sign-up, sign-out, get-session, verify-email, reset-password,
 * ...) is Better Auth's own API surface, not a custom BFF proxy like
 * app/api/locations/search/route.ts. `toNextJsHandler` wires each real
 * HTTP method to lib/auth.ts's configured instance directly.
 */
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(auth)
