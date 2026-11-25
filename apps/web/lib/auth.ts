import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import {
  sendChangeEmailConfirmation,
  sendResetPasswordEmail,
  sendSecurityNotice,
  sendVerificationEmail,
  smtpConfigured,
} from './email'
import { enabledSocialProviders, socialProvidersConfig } from './social-providers'
import { breachCheckEnabled, isPasswordBreached } from './password-check'
import { internalApiFetch } from './internal-api-client'

/**
 * Sprint 28 ("Authentication"), per docs/architecture.md's ADR-005:
 * Better Auth in the Next.js application, email/password accounts,
 * verified email, password reset, secure HTTP-only cookies, session
 * rotation, PostgreSQL persistence. Sign in with Google/Apple was added
 * by the product owner's 2026-11-25 amendment to that ADR (lib/
 * social-providers.ts; each is on only when its credentials are set).
 * Passkeys, guest accounts, and legacy-user migration stay excluded.
 *
 * Database: ADR-006 calls for one Neon PostgreSQL project with a
 * separate `auth` schema owned by a least-privilege web role -- not
 * available yet (sprint 9/10's standing credentials blocker), so this
 * points at DATABASE_URL, a real local Postgres for dev today, wired
 * the same way `apps/web/README.md` documents it: create the role/
 * schema once, then point DATABASE_URL at it. Nothing here is
 * Neon-specific; moving to the real pooled Neon project later is a
 * connection-string change, not a code change. `schemaName: 'auth'`
 * uses Better Auth's own first-class Postgres schema support (it
 * qualifies every statement itself, rather than relying on the
 * connection's `search_path`), matching ADR-006's schema-per-concern
 * split -- this app's role has no access to any future `forecast`
 * schema apps/api might eventually own.
 *
 * Verification/reset email: emailAndPassword.requireEmailVerification
 * and emailVerification.sendOnSignUp both key off whether SMTP is
 * actually configured (lib/email.ts's `smtpConfigured`) -- the same
 * "if unset, accounts auto-confirm and no emails are sent" convention
 * CLAUDE.md documents for the retired legacy app, so an unconfigured
 * SMTP_HOST never leaves a real signup stuck waiting on a link nothing
 * can send. Once SMTP is configured (any environment, dev included),
 * verification becomes real and required.
 *
 * Rate limiting: ADR-005 calls for separate limits per action (login,
 * registration, verification resend, password reset). Better Auth's
 * built-in limiter is disabled outside production by default --
 * enabled here unconditionally instead, both because dev is where
 * these limits actually get exercised/tested and because "off in dev"
 * would leave an untested claim of the ADR's own requirement.
 *
 * Explicitly NOT attempted in this PR (see docs/CANONICAL_ROADMAP.md's
 * sprint 28/44 rows): bot/CAPTCHA defense on registration needs a real
 * third-party provider (Cloudflare Turnstile or hCaptcha) and a site
 * key/secret this session has no credentials for -- flagged the same
 * way sprints 9/10's Vercel/Render/Neon credentials were flagged,
 * rather than guessed at. CSRF/origin validation, secure/HttpOnly
 * cookies, and session rotation are all Better Auth defaults already
 * satisfying that half of the ADR with no extra config.
 *
 * `advanced.database.validateSchema` is explicitly gated on DATABASE_URL
 * being set: Better Auth fires an async startup check against the real
 * database and logs an error if it can't connect -- correct and wanted
 * whenever a database is actually configured, but pure noise during
 * `next build`'s route-module collection pass, which imports this file
 * (to determine app/api/auth/[...all]/route.ts's config) without ever
 * serving a real request. `apps-ci.yml`'s web-build/web-lint jobs run
 * with no DATABASE_URL at all, matching that same "nothing to validate
 * against" case.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Self-hosting (install.sh): the same server is often opened by LAN IP,
// hostname and localhost. Better Auth rejects sign-in/sign-up from any
// origin it doesn't trust, so extra addresses can be listed here,
// comma-separated, e.g. "http://saltline.local:5757,http://localhost:5757".
const EXTRA_TRUSTED_ORIGINS = (process.env.SALTLINE_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/** Every origin allowed to make signed-in, state-changing requests: shared
 * by Better Auth and lib/require-session-user-id.ts's Origin check. */
export const TRUSTED_ORIGINS = [SITE_URL, ...EXTRA_TRUSTED_ORIGINS]

export { enabledSocialProviders }
const PROVIDER_NAMES: Record<string, string> = { google: 'Google', apple: 'Apple' }

/** Sends a security notice without holding up (or ever failing) the
 * request that triggered it. Without SMTP, lib/email.ts just logs it. */
function notify(to: string | undefined, what: string, advice: string) {
  if (!to) return
  void sendSecurityNotice(to, what, advice).catch((error) => {
    console.error('Failed to send security notice:', error)
  })
}

const IF_NOT_YOU_RESET =
  'If this wasn’t you, use “Forgot password?” on the log-in page right away: a reset signs out every device.'

/** Where each password-setting endpoint carries the new password. */
const NEW_PASSWORD_FIELD: Record<string, 'password' | 'newPassword'> = {
  '/sign-up/email': 'password',
  '/change-password': 'newPassword',
  '/reset-password': 'newPassword',
}

/** Change email needs mail delivery: both of its links are emailed. */
export const changeEmailEnabled = smtpConfigured

export const auth = betterAuth({
  appName: 'Saltline',
  baseURL: SITE_URL,
  // Apple posts its sign-in response back from its own origin.
  trustedOrigins: enabledSocialProviders.includes('apple')
    ? [...TRUSTED_ORIGINS, 'https://appleid.apple.com']
    : TRUSTED_ORIGINS,
  socialProviders: socialProvidersConfig(),
  account: {
    // Google/Apple sign-in with the email of an existing account joins
    // that account -- only when its email was confirmed (Better Auth's
    // requireLocalEmailVerified default), so nobody can pre-register a
    // victim's address and inherit their Google sign-in. Otherwise the
    // login page explains how to connect it from Account instead.
    accountLinking: { enabled: true, trustedProviders: ['google', 'apple'] },
  },
  database: {
    dialect: new PostgresDialect({ pool }),
    type: 'postgres',
    schemaName: 'auth',
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: smtpConfigured,
    minPasswordLength: 8,
    // A reset is how someone takes back a compromised account, so it
    // signs out every existing session (the attacker's included).
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      notify(
        user.email,
        'your password was reset',
        'Every device was signed out. If this wasn’t you, reset it again now and make sure your email account is secure.',
      )
    },
    // With email verification on, signing up with a taken address looks
    // like a normal sign-up (no hint that the account exists); the real
    // owner gets told instead.
    onExistingUserSignUp: async ({ user }) => {
      notify(
        user.email,
        'someone tried to create an account with your email',
        'If it was you, you already have an account: log in, or use “Forgot password?”. If not, you can ignore this: nothing changed.',
      )
    },
    sendResetPassword: async ({ user, url }) => {
      // Sprint 47 ("Degraded-mode UX"): a transient SMTP outage must
      // not fail the reset *request* itself -- Better Auth's own
      // forgot-password client flow already shows the same generic
      // "check your email" message regardless of real delivery (an
      // account-enumeration precaution, not something this changes),
      // so swallowing a send failure here doesn't hide anything a
      // successful send would have told the visitor either.
      try {
        await sendResetPasswordEmail(user.email, url)
      } catch (error) {
        console.error('Failed to send password-reset email:', error)
      }
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Same reasoning as sendResetPassword above: the account must
      // still get created even if this specific email can't be sent
      // right now.
      try {
        await sendVerificationEmail(user.email, url)
      } catch (error) {
        console.error('Failed to send verification email:', error)
      }
    },
    sendOnSignUp: smtpConfigured,
    autoSignInAfterVerification: true,
  },
  user: {
    // Changing your sign-in email: a confirmation link goes to the
    // *current* address first, then a verification link to the new one,
    // so a stolen session alone can't move the account to a new inbox.
    // Off without SMTP: neither link could be delivered.
    changeEmail: {
      enabled: changeEmailEnabled,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        try {
          await sendChangeEmailConfirmation(user.email, newEmail, url)
        } catch (error) {
          console.error('Failed to send change-email confirmation:', error)
        }
      },
    },
    // Sprint 45 ("Privacy and deletion"): self-service account deletion,
    // required at v1 launch per the round-2 product decision (a public
    // product with real accounts), not deferred with the rest of that
    // sprint's row. Confirmation is the caller's current password
    // (app/account/account-page.tsx always sends one) rather than
    // Better Auth's email-verification-token alternative -- a second,
    // SMTP-dependent flow would only add complexity for a feature that
    // already has a real, standard safeguard. `beforeDelete` cleans up
    // apps/api's forecast-schema data (preferences, saved locations)
    // *before* Better Auth removes the auth-schema user row, so no
    // per-user data ever outlives the account that owns it -- the two
    // schemas ADR-006 splits between apps have no shared foreign key to
    // cascade this automatically.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await internalApiFetch('/v1/me', { method: 'DELETE', userId: user.id })
      },
    },
  },
  // Sprint 43 ("Privacy-safe analytics"): a `registration` event, the
  // one signal this sprint wires that only apps/web can produce --
  // account creation lands in this app's own `auth`-schema database,
  // which apps/api has no access to (ADR-006), so this goes through
  // the same signed internal path `deleteUser.beforeDelete` above
  // already uses rather than apps/api reaching into a schema it
  // doesn't own. Fires after the real insert (`user.create.after`,
  // not `before`), so a rejected/failed signup never gets counted.
  // Best-effort, same reasoning as the email hooks above: an analytics
  // side effect must never fail (or even be seen to fail) the actual
  // signup, so failures are swallowed, not surfaced.
  hooks: {
    // Known-breached passwords are refused wherever a password is set.
    before: createAuthMiddleware(async (ctx) => {
      const field = NEW_PASSWORD_FIELD[ctx.path]
      if (!breachCheckEnabled || !field) return
      const password = (ctx.body as Record<string, unknown> | undefined)?.[field]
      if (typeof password !== 'string' || password.length < 8) return
      if ((await isPasswordBreached(password)) === true) {
        throw APIError.from('BAD_REQUEST', {
          code: 'PASSWORD_COMPROMISED',
          message: 'That password has appeared in a data breach. Choose a different one.',
        })
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/change-password') return
      if (ctx.context.returned instanceof Error) return
      notify(ctx.context.session?.user.email, 'your password was changed', IF_NOT_YOU_RESET)
    }),
  },
  databaseHooks: {
    account: {
      create: {
        // Google/Apple connected to an account that already existed (a
        // brand-new account signing up with Google is not news to anyone).
        after: async (account, ctx) => {
          const provider = PROVIDER_NAMES[account.providerId]
          if (!provider || !ctx) return
          const user = await ctx.context.internalAdapter.findUserById(account.userId)
          if (!user || Date.now() - new Date(user.createdAt).getTime() < 5 * 60 * 1000) return
          notify(
            user.email,
            `${provider} sign-in was connected`,
            `If this wasn’t you, log in, disconnect it under Account → Ways to sign in, and change your password.`,
          )
        },
      },
      delete: {
        // Only an explicit disconnect: deleting the whole account also
        // removes these rows, and that needs no notice.
        after: async (account, ctx) => {
          const provider = PROVIDER_NAMES[account.providerId]
          if (!provider || ctx?.path !== '/unlink-account') return
          notify(
            ctx.context.session?.user.email,
            `${provider} sign-in was removed`,
            IF_NOT_YOU_RESET,
          )
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          try {
            await internalApiFetch('/v1/analytics/events', {
              method: 'POST',
              body: { event_type: 'registration', user_id: user.id },
            })
          } catch (error) {
            console.error('Failed to record registration analytics event:', error)
          }
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      // Every page load checks the session (header, tab bar). Under the
      // 30/min default a quick run through the tabs -- or a household
      // sharing one IP -- got 429s, and the header then showed a signed-in
      // user as signed out. It's a cheap read, not a guessing target.
      '/get-session': { window: 60, max: 600 },
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
      // Checks the current password, so it's a guessing target too.
      '/change-password': { window: 60, max: 5 },
      '/change-email': { window: 300, max: 3 },
      '/send-verification-email': { window: 300, max: 3 },
      '/request-password-reset': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
    },
  },
  plugins: [nextCookies()],
  advanced: {
    database: {
      validateSchema: Boolean(process.env.DATABASE_URL),
    },
  },
})
