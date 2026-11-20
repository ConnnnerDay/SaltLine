'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Container, Field } from '@/app/components/ui'
import { signUp } from '@/lib/auth-client'
import { safeRedirectTarget } from '@/lib/safe-redirect'
import { authErrorMessage } from '@/lib/auth-errors'

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
function RegisterForm() {
  const router = useRouter()
  const next = safeRedirectTarget(useSearchParams().get('next'), '/locations')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const onboarding = `/onboarding?next=${encodeURIComponent(next)}`
    const { data, error: signUpError } = await signUp.email({
      name,
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
    return (
      <Card role="status">
        <h2 className="text-lg font-bold text-text">Check your email</h2>
        <p className="mt-2 text-sm text-text-muted">
          We sent a confirmation link to <span className="font-semibold text-text">{email}</span>.
          Click it to finish creating your account and set up your fishing profile.
        </p>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <Field
            label="Name"
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="At least 8 characters."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error ?? undefined}
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

export default function RegisterPage() {
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
            <RegisterForm />
          </Suspense>
        </div>
      </Container>
    </main>
  )
}
