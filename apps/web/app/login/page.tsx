'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Container, Field } from '@/app/components/ui'
import { signIn } from '@/lib/auth-client'
import { safeRedirectTarget } from '@/lib/safe-redirect'

/**
 * `?next=` (sprint 29): a visitor bounced off a session-gated page
 * (app/locations/page.tsx, app/forecast/[locationId]/page.tsx) lands
 * back where they were headed after logging in, instead of always `/`.
 * `useSearchParams` needs a Suspense boundary per Next's own
 * requirement -- same pattern app/reset-password/page.tsx already uses
 * for the same reason.
 */
function LoginForm() {
  const router = useRouter()
  const next = safeRedirectTarget(useSearchParams().get('next'), '/')
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
      setError(signInError.message ?? 'Could not log you in.')
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <>
      <Card>
        <form onSubmit={handleSubmit} noValidate>
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error ?? undefined}
          />
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

export default function LoginPage() {
  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-sm flex-col gap-6 py-10 sm:py-16">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Log in</h1>
            <p className="mt-3 text-text-muted">Welcome back to Saltline.</p>
          </header>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </Container>
    </main>
  )
}
