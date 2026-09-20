'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Card, Container, Field } from '@/app/components/ui'
import { authClient } from '@/lib/auth-client'

/**
 * Reached from the email link app/forgot-password/page.tsx sends:
 * lib/auth.ts's Better Auth instance redirects here with a real,
 * server-validated `?token=` after its own `/reset-password/:token` GET
 * callback confirms the token isn't expired/invalid -- this page never
 * validates the token itself, only submits it with the new password.
 * `useSearchParams` needs a Suspense boundary per Next's own
 * requirement; this route has no static shell worth preserving anyway
 * (a bare token in the URL), so the fallback is minimal.
 */
function ResetPasswordForm() {
  const token = useSearchParams().get('token')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!token) {
      setError('This reset link is missing its token. Request a new one.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    const { error: resetError } = await authClient.resetPassword({ newPassword, token })
    setIsSubmitting(false)
    if (resetError) {
      setError(resetError.message ?? 'This reset link is invalid or has expired.')
      return
    }
    setDone(true)
  }

  return (
    <Card>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-text">Your password has been reset.</p>
          <Button variant="primary" href="/login" className="w-full">
            Log in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <Field
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="At least 8 characters."
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>
      )}
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-sm flex-col gap-6 py-10 sm:py-16">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Set a new password</h1>
          </header>
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </Container>
    </main>
  )
}
