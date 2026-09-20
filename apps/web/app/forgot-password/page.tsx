'use client'

import { useState } from 'react'
import { Button, Card, Container, Field } from '@/app/components/ui'
import { authClient } from '@/lib/auth-client'

/**
 * ADR-005's "password reset" half. Always shows the same success state
 * whether or not the email is a real account -- Better Auth's own
 * request-password-reset endpoint doesn't reveal account existence
 * either, so this page shouldn't undo that by branching on a
 * per-address error.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    })
    setIsSubmitting(false)
    setSubmitted(true)
  }

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-sm flex-col gap-6 py-10 sm:py-16">
          <header>
            <h1 className="text-3xl font-bold text-text sm:text-4xl">Reset your password</h1>
            <p className="mt-3 text-text-muted">
              Enter your account email and we&apos;ll send a reset link.
            </p>
          </header>

          <Card>
            {submitted ? (
              <p className="text-text">
                If an account exists for that email, a reset link is on its way.
              </p>
            ) : (
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
                <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </Container>
    </main>
  )
}
