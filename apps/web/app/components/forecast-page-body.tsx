import { LocationBar } from './location-bar'
import type { NearbyCam } from '@/lib/get-cams'
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
  errorReason,
  cams,
  retryHref,
  backHref,
  backLabel,
  children,
}: {
  forecast: ForecastEnvelope | null
  error: string | null
  /** Plain-language cause for the error card (lib/diagnose-api.ts). */
  errorReason?: string | null
  /** Nearby public live-cam links (lib/get-cams.ts). */
  cams?: NearbyCam[]
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
      <LocationBar
        backHref={backHref}
        backLabel={backLabel}
        label={forecast?.location.label ?? 'Forecast'}
      />

      <Container>
        <div className="flex flex-col gap-4 py-5 pb-16">
          {error && <ForecastErrorCard message={error} reason={errorReason} retryHref={retryHref} />}
          {forecast && <ForecastCard forecast={forecast} cams={cams} />}
          {children}
        </div>
      </Container>
    </main>
  )
}
