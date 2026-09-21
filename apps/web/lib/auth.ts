import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { sendResetPasswordEmail, sendVerificationEmail, smtpConfigured } from './email'
import { internalApiFetch } from './internal-api-client'

/**
 * Sprint 28 ("Authentication"), per docs/architecture.md's ADR-005:
 * Better Auth in the Next.js application, email/password accounts,
 * verified email, password reset, secure HTTP-only cookies, session
 * rotation, PostgreSQL persistence. OAuth, passkeys, guest accounts, and
 * legacy-user migration are excluded, matching that ADR and the
 * canonical roadmap's "legacy app retired outright, no accounts worth
 * migrating" decision.
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

export const auth = betterAuth({
  appName: 'Saltline',
  baseURL: SITE_URL,
  trustedOrigins: [SITE_URL],
  database: {
    dialect: new PostgresDialect({ pool }),
    type: 'postgres',
    schemaName: 'auth',
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: smtpConfigured,
    minPasswordLength: 8,
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
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
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
