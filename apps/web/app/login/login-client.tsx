'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Container, Field } from '@/app/components/ui'
import { authClient, signIn } from '@/lib/auth-client'
import { SocialButtons } from '@/app/components/social-buttons'
import type { SocialProviderId } from '@/lib/social-providers'
import { safeRedirectTarget } from '@/lib/safe-redirect'
import { authErrorMessage } from '@/lib/auth-errors'

/**
 * `?next=` (sprint 29): a visitor bounced off a session-gated page
 * (app/locations/page.tsx, app/forecast/[locationId]/page.tsx) lands
 * back where they were headed after logging in, instead of always `/`.
 * `useSearchParams` needs a Suspense boundary per Next's own
 * requirement -- same pattern app/reset-password/page.tsx already uses
 * for the same reason.
 */
/** A Google/Apple sign-in that came back with `?error=` (Better Auth's
 * error codes), said plainly. */
function socialErrorMessage(code: string | null): string | null {
  if (!code) return null
  if (code === 'account_not_linked') {
    return 'There’s already a Saltline account with that email. Log in with your password, then connect Google or Apple from your Account page.'
  }
  if (code === 'access_denied') return null // they cancelled at the provider
  if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
    return 'That confirmation link has expired or was already used. Log in, and if your email still needs confirming we’ll offer to send a new link.'
  }
  return 'That sign-in didn’t work. Try again, or log in with your email and password.'
}

function LoginForm({ socialProviders }: { socialProviders: SocialProviderId[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeRedirectTarget(params.get('next'), '/')
  const socialError = socialErrorMessage(params.get('error'))
  const [unverified, setUnverified] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [resent, setResent] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const { error: signInError } = await signIn.email({ email, password })
    setIsSubmitting(false)
    if (signInError) {
      setUnverified(signInError.code === 'EMAIL_NOT_VERIFIED')
      setResent('idle')
      setError(authErrorMessage(signInError, 'Could not log you in.'))
      return
    }
    router.push(next)
    router.refresh()
  }

  async function resend() {
    setResent('sending')
    const { error: sendError } = await authClient.sendVerificationEmail({
      email,
      // Never finished setup: the link signs them in and continues there.
      callbackURL: `/onboarding?next=${encodeURIComponent(next === '/' ? '/locations' : next)}`,
    })
    setResent(sendError ? 'failed' : 'sent')
  }

  return (
    <>
      {socialError && (
        <p role="alert" className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text">
          {socialError}
        </p>
      )}
      <Card>
        <SocialButtons
          providers={socialProviders}
          callbackURL={next}
          newUserCallbackURL={`/onboarding?next=${encodeURIComponent(next === '/' ? '/locations' : next)}`}
          errorCallbackURL={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`}
        />
        <form method="post" onSubmit={handleSubmit} noValidate className={socialProviders.length ? 'mt-4' : undefined}>
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
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error ?? undefined}
          />
          <label className="-mt-2 mb-3 flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Show password
          </label>
          {unverified && (
            <div className="mb-4 flex flex-col gap-2 text-sm">
              <Button type="button" variant="secondary" className="w-fit" onClick={resend} disabled={resent === 'sending' || resent === 'sent'}>
                {resent === 'sending' ? 'Sending…' : resent === 'sent' ? 'Sent' : 'Resend the confirmation email'}
              </Button>
              {resent === 'sent' && (
                <p role="status" className="text-text-muted">
                  Sent to {email}. Check spam too; the link works once.
                </p>
              )}
              {resent === 'failed' && (
                <p role="alert" className="text-text">
                  Couldn&apos;t send it right now. Wait a few minutes and try again.
                </p>
              )}
            </div>
          )}
          <div className="mb-4 flex justify-end">
            <Link href="/forgot-password" className="text-sm font-semibold text-primary">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-text-muted">
        Don&apos;t have an account?{' '}
        <Link
          href={next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`}
          className="font-semibold text-primary"
        >
          Create one
        </Link>
      </p>
    </>
  )
}

export function LoginPageClient({ socialProviders }: { socialProviders: SocialProviderId[] }) {
  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-md flex-col gap-6 py-10 sm:py-14">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Log in</h1>
            <p className="mt-3 text-text-muted">Welcome back to Saltline.</p>
          </header>

          <Suspense fallback={null}>
            <LoginForm socialProviders={socialProviders} />
          </Suspense>
        </div>
      </Container>
    </main>
  )
}
