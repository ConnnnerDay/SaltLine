import { createPrivateKey, sign } from 'node:crypto'

/**
 * "Sign in with Google / Apple" (amended ADR-005, 2026-11-25). Each turns
 * on by itself when its credentials are set on the server, like email
 * does with SMTP_HOST, and stays hidden until then. Env names follow the
 * legacy app's (CLAUDE.md): GOOGLE_CLIENT_ID/SECRET and
 * APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY.
 *
 * Redirect URLs to register with each provider:
 *   <NEXT_PUBLIC_SITE_URL>/api/auth/callback/google
 *   <NEXT_PUBLIC_SITE_URL>/api/auth/callback/apple
 */

export type SocialProviderId = 'google' | 'apple'

const env = (name: string) => process.env[name]?.trim() || undefined

const GOOGLE_CLIENT_ID = env('GOOGLE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = env('GOOGLE_CLIENT_SECRET')
const APPLE_CLIENT_ID = env('APPLE_CLIENT_ID') // the Services ID
const APPLE_TEAM_ID = env('APPLE_TEAM_ID')
const APPLE_KEY_ID = env('APPLE_KEY_ID')
// The .p8 key's contents; "\n" escapes are accepted so it fits one env line.
const APPLE_PRIVATE_KEY = env('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n')

const googleEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
const appleEnabled = Boolean(APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY)

/** Providers with credentials on this server, in button order. */
export const enabledSocialProviders: SocialProviderId[] = [
  ...(googleEnabled ? (['google'] as const) : []),
  ...(appleEnabled ? (['apple'] as const) : []),
]

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')

/**
 * Apple's "client secret" is a JWT signed with the .p8 key (ES256),
 * valid for at most six months. Made here from the key rather than
 * pasted in, so it never needs renewing by hand: a new one is signed
 * whenever the cached one is more than a day old.
 */
export function appleClientSecret(now = Date.now()): string {
  const iat = Math.floor(now / 1000)
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: APPLE_KEY_ID }))
  const claims = b64url(
    JSON.stringify({
      iss: APPLE_TEAM_ID,
      iat,
      exp: iat + 180 * 24 * 3600,
      aud: 'https://appleid.apple.com',
      sub: APPLE_CLIENT_ID,
    }),
  )
  const input = `${header}.${claims}`
  const signature = sign('sha256', Buffer.from(input), {
    key: createPrivateKey(APPLE_PRIVATE_KEY ?? ''),
    dsaEncoding: 'ieee-p1363',
  })
  return `${input}.${b64url(signature)}`
}

let appleSecret: { value: string; at: number } | null = null
function currentAppleSecret(): string {
  const now = Date.now()
  if (!appleSecret || now - appleSecret.at > 24 * 3600 * 1000) {
    appleSecret = { value: appleClientSecret(now), at: now }
  }
  return appleSecret.value
}

/** Better Auth's `socialProviders` option: only the configured ones. */
export function socialProvidersConfig() {
  return {
    ...(googleEnabled
      ? { google: { clientId: GOOGLE_CLIENT_ID!, clientSecret: GOOGLE_CLIENT_SECRET! } }
      : {}),
    ...(appleEnabled
      ? {
          apple: {
            clientId: APPLE_CLIENT_ID!,
            // A getter, so a long-running server keeps handing Apple a
            // fresh secret if Better Auth reads it per sign-in.
            get clientSecret() {
              return currentAppleSecret()
            },
          },
        }
      : {}),
  }
}
