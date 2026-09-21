'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Card, Container } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import { safeRedirectTarget } from '@/lib/safe-redirect'

/**
 * Sprint 30 ("Onboarding shell") -- the gap it closes: app/register/
 * page.tsx's own docstring already flagged that registration alone was
 * "nothing here is a real profile/onboarding flow." A brand-new user
 * finishing signup used to land back on `/` (the marketing homepage)
 * with the same "Find your spot" CTA they'd already seen pre-signup --
 * this page is what register now routes through instead (`?next=`
 * carried forward, same `safeRedirectTarget` guard login/register
 * already use for the same open-redirect reason).
 *
 * Static walkthrough carousel, adapted from v2/frontend/src/pages/
 * Onboarding.tsx's concept per docs/R1_RECONCILIATION_AUDIT.md's row
 * for this sprint -- but the copy itself is new, not ported: v2's steps
 * promised ranked species and rig recommendations, which
 * docs/CANONICAL_ROADMAP.md's "Deferred until production evidence"
 * list explicitly excludes from v1. These three steps instead restate
 * app/page.tsx's own three value props (go/no-go verdict, every source
 * shown, best hour) so onboarding never promises anything the product
 * doesn't already do today -- the same Integrity posture that page's
 * own docstring argues for its "Popular spots" links.
 *
 * No `onboarding_completed` field or other persisted state: nothing in
 * docs/product-definition.md's "V1 capabilities" preferences list names
 * onboarding-seen tracking, and this flow only ever needs to run once,
 * right after a real signup -- inventing a database column (and a
 * migration) to remember that would be scope beyond what this sprint's
 * acceptance bar ("mobile recording from registration to dashboard")
 * actually asks for.
 */
const STEPS = [
  {
    title: 'One clear verdict',
    body: 'Go, marginal, or skip it — with real tide, wind, and wave data behind the call, and the reasoning shown, not hidden behind a score.',
  },
  {
    title: 'Every source shown',
    body: 'Marine zone, buoy, tide station — each labeled fresh, degraded, or down. No hidden guesses, no invented numbers.',
  },
  {
    title: 'The best hour, not just today',
    body: "Tide swings and solunar windows narrowed down to when it's actually worth showing up.",
  },
  {
    title: 'Find your first spot',
    body: 'Search a coastal point or use your current location to get your first forecast.',
  },
]

function OnboardingCarousel() {
  const next = safeRedirectTarget(useSearchParams().get('next'), '/locations')
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1

  return (
    <Card className="flex min-h-[22rem] flex-col">
      <p className="text-sm font-semibold text-text-muted" aria-live="polite">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-text sm:text-3xl">{STEPS[step].title}</h1>
      <p className="mt-3 text-base leading-relaxed text-text-muted">{STEPS[step].body}</p>

      <div className="flex-1" />

      <div className="mt-6 flex items-center justify-center gap-2" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span
            key={s.title}
            className={cx(
              'h-1.5 w-1.5 rounded-full transition-colors',
              i === step ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </div>

      <div className="mt-6 flex justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        {isLast ? (
          <Button href={next} variant="primary">
            Get started
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        )}
      </div>
    </Card>
  )
}

export default function OnboardingPage() {
  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-sm flex-col gap-6 py-10 sm:py-16">
          <Suspense fallback={null}>
            <OnboardingCarousel />
          </Suspense>
        </div>
      </Container>
    </main>
  )
}
