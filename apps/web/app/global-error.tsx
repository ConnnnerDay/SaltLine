'use client'

import { useEffect } from 'react'
import './globals.css'
import { BrandMark } from './components/brand-mark'
import { Button, Container } from './components/ui'

/**
 * Next's last-resort error boundary -- only reached when the root
 * layout itself (app/layout.tsx) throws, which app/error.tsx can't
 * catch since that file renders *inside* the layout. Per the App
 * Router contract this file replaces the whole document, so it owns
 * its own <html>/<body> and can't rely on the root layout's SiteHeader,
 * fonts, or metadata -- it imports globals.css directly for the design
 * tokens instead. Deliberately minimal: this path only fires when
 * something above it is already broken, so it avoids depending on
 * anything with its own failure surface.
 */
export default function GlobalError({
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
    <html lang="en">
      <body>
        <main>
          <Container>
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
              <BrandMark className="h-9 w-9" />
              <h1 className="text-3xl font-bold text-text sm:text-4xl">Something went wrong</h1>
              <p className="max-w-sm text-text-muted">
                Saltline hit an unexpected error loading the page. Try again, or head back home.
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
      </body>
    </html>
  )
}
