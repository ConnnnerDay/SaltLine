import Link from 'next/link'
import { Container } from './ui'
import { ForecastCard, ForecastErrorCard, type ForecastEnvelope } from './forecast-card'

/**
 * The photo-hero-band-plus-card layout both forecast surfaces share:
 * app/forecast/[locationId]/page.tsx (the authenticated core flow,
 * sprint 29) and app/share/[locationId]/page.tsx (the public,
 * non-personalized share page, sprint 49). `backHref`/`backLabel` are
 * the one real difference between the two -- the authenticated page
 * backs to `/locations`' search, the public share page backs to `/`,
 * the only route an anonymous visitor can actually reach.
 */
export function ForecastPageBody({
  forecast,
  error,
  retryHref,
  backHref,
  backLabel,
  children,
}: {
  forecast: ForecastEnvelope | null
  error: string | null
  /** Sprint 47: the current page's own URL, so a failed fetch gets a
   * real "Try again" action (see ForecastErrorCard) instead of only a
   * "back" link that leaves the failure unresolved. */
  retryHref?: string
  backHref: string
  backLabel: string
  /** Rendered after the card/error, inside the same Container -- the
   * authenticated page's `SaveLocationButton` (sprint 37) and the
   * public share page's sign-up call to action both use this slot
   * rather than each page duplicating this whole layout for one extra
   * block. */
  children?: React.ReactNode
}) {
  return (
    <main>
      <div className="ph-photo flex flex-col justify-between px-5 py-5" style={{ minHeight: '190px' }}>
        <Link
          href={backHref}
          className="relative z-10 flex h-9 w-9 items-center justify-center rounded-[0.625rem] bg-white/20 text-white no-underline"
          aria-label={backLabel}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 5 L8 12 L15 19" />
          </svg>
        </Link>
        <div className="relative z-10 flex flex-col gap-1.5">
          <p className="ph-photo-label">Photo placeholder: pier pilings at low tide, wide shot</p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {forecast?.location.label ?? 'Forecast'}
          </h1>
        </div>
      </div>

      <Container>
        <div className="py-6 pb-16">
          {error && <ForecastErrorCard message={error} retryHref={retryHref} />}
          {forecast && <ForecastCard forecast={forecast} />}
          {children}
        </div>
      </Container>
    </main>
  )
}
