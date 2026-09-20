'use client'

import { useEffect } from 'react'
import { BrandMark } from './components/brand-mark'
import { Button, Container } from './components/ui'

/**
 * Next's App Router error-boundary file convention. Sprint 27's rebrand
 * gave app/not-found.tsx a branded 404, but any *unexpected* render or
 * runtime error still fell through to Next's own default overlay -- the
 * one other built-in error surface the rebrand never reached. Renders
 * inside the root layout, so the persistent SiteHeader (app/components/
 * site-header.tsx) still shows. Must be a Client Component per the App
 * Router contract -- `reset()` re-renders the failed segment in place
 * rather than forcing a full page reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main>
      <Container>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-20 text-center">
          <BrandMark className="h-9 w-9" />
          <h1 className="text-3xl font-bold text-text sm:text-4xl">Something went wrong</h1>
          <p className="max-w-sm text-text-muted">
            That&apos;s on us, not your connection. Try again, or head back home.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
            <Button variant="secondary" href="/">
              Back home
            </Button>
          </div>
        </div>
      </Container>
    </main>
  )
}
