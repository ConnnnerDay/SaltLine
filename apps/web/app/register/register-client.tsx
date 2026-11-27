'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Container, Field } from '@/app/components/ui'
import { authClient, signUp } from '@/lib/auth-client'
import { SocialButtons } from '@/app/components/social-buttons'
import type { SocialProviderId } from '@/lib/social-providers'
import { safeRedirectTarget } from '@/lib/safe-redirect'
import { authErrorMessage } from '@/lib/auth-errors'
import { suggestEmail } from '@/lib/email-typo'

/**
 * Sprint 28 ("Authentication"), per docs/architecture.md's ADR-005:
 * email/password registration through Better Auth (lib/auth.ts), which
 * owns hashing, session creation, and rate limiting -- this page is
 * presentation and error display only, not auth logic. `name` is
 * collected because Better Auth's default user schema requires it (see
 * the migrated `auth.user` table).
 *
 * `?next=` (sprint 29): see app/login/page.tsx's docstring -- same
 * reasoning, same `safeRedirectTarget` guard against an open redirect.
 * Defaults to `/locations`, not `/` -- a brand-new user has nothing
 * saved yet, so the search page (not the marketing homepage they just
 * left) is the real first-run destination.
 *
 * Sprint 30: a fresh signup routes through `/onboarding` first, not
 * straight to `next` -- that page carries `next` forward itself once
 * its walkthrough finishes. Logging in (app/login/page.tsx) is
 * unchanged and still goes straight to `next`; onboarding is only for
 * a signup that just happened, not every return visit.
 */
/** A friendly name from an email when none was typed: "jake.smith42@…"
 * -> "Jake". Changeable later on the Account page. */
export function nameFromEmail(email: string): string {
  const first = email.split('@')[0]?.split(/[._+\-\d]+/).find((part) => part.length >= 2) ?? ''
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : 'Angler'
}

function RegisterForm({ socialProviders }: { socialProviders: SocialProviderId[] }) {
  const router = useRouter()
  const next = safeRedirectTarget(useSearchParams().get('next'), '/locations')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)
  const [resent, setResent] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const onboarding = `/onboarding?next=${encodeURIComponent(next)}`
    const { data, error: signUpError } = await signUp.email({
      name: name.trim() || nameFromEmail(email.trim()),
      email,
      password,
      // Where the verification link lands (signed in, via lib/auth.ts's
      // autoSignInAfterVerification) when this server requires one.
      callbackURL: onboarding,
    })
    setIsSubmitting(false)
    if (signUpError) {
      setError(authErrorMessage(signUpError, 'Could not create your account.'))
      return
    }
    if (!data?.token) {
      // Email verification is on (SMTP configured): no session until the
      // link in the email is clicked, so say so instead of sending them to
      // a sign-in-only setup page.
      setCheckEmail(true)
      return
    }
    router.push(onboarding)
    router.refresh()
  }

  if (checkEmail) {
    const onboarding = `/onboarding?next=${encodeURIComponent(next)}`
    return (
      <Card className="flex flex-col gap-3">
        <div role="status">
          <h2 className="text-lg font-bold text-text">Check your email</h2>
          <p className="mt-2 text-sm text-text-muted">
            We sent a confirmation link to <span className="font-semibold text-text">{email}</span>.
            Click it to finish creating your account and set up your fishing profile.
          </p>
        </div>
        <p className="text-sm text-text-muted">Nothing after a few minutes? Check your spam folder, or:</p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={resent === 'sending' || resent === 'sent'}
            onClick={async () => {
              setResent('sending')
              const { error: sendError } = await authClient.sendVerificationEmail({ email, callbackURL: onboarding })
              setResent(sendError ? 'failed' : 'sent')
            }}
          >
            {resent === 'sending' ? 'Sending…' : resent === 'sent' ? 'Sent again' : 'Resend the email'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCheckEmail(false)
              setResent('idle')
            }}
          >
            Use a different email
          </Button>
        </div>
        {resent === 'failed' && (
          <p role="alert" className="text-sm text-text">
            Couldn&apos;t send it right now. Wait a few minutes and try again.
          </p>
        )}
      </Card>
    )
  }

  return (
    <>
      <Card>
        <SocialButtons
          providers={socialProviders}
          callbackURL={next}
          newUserCallbackURL={`/onboarding?next=${encodeURIComponent(next)}`}
          errorCallbackURL={next === '/locations' ? '/login' : `/login?next=${encodeURIComponent(next)}`}
        />
        <form method="post" onSubmit={handleSubmit} noValidate className={socialProviders.length ? 'mt-4' : undefined}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setEmailSuggestion(null)
            }}
            onBlur={() => setEmailSuggestion(suggestEmail(email.trim()))}
          />
          {emailSuggestion && (
            <p role="status" className="-mt-2 mb-4 text-sm text-text">
              Did you mean{' '}
              <button
                type="button"
                className="font-semibold text-primary underline"
                onClick={() => {
                  setEmail(emailSuggestion)
                  setEmailSuggestion(null)
                }}
              >
                {emailSuggestion}
              </button>
              ?
            </p>
          )}
          <Field
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            hint="At least 8 characters."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error ?? undefined}
          />
          <label className="-mt-2 mb-4 flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Show password
          </label>
          <Field
            label="Name (optional)"
            name="name"
            autoComplete="given-name"
            hint="What we call you. You can change it later."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-text-muted">
        Already have an account?{' '}
        <Link
          href={next === '/locations' ? '/login' : `/login?next=${encodeURIComponent(next)}`}
          className="font-semibold text-primary"
        >
          Log in
        </Link>
      </p>
    </>
  )
}

export function RegisterPageClient({ socialProviders }: { socialProviders: SocialProviderId[] }) {
  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-md flex-col gap-6 py-10 sm:py-14">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Create your account</h1>
            <p className="mt-3 text-text-muted">
              Save a home spot and it opens to that forecast every time.
            </p>
          </header>

          <Suspense fallback={null}>
            <RegisterForm socialProviders={socialProviders} />
          </Suspense>
        </div>
      </Container>
    </main>
  )
}
