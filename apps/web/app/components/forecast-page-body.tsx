import { LocationBar } from './location-bar'
import { requestUnits } from '@/lib/request-units'
import { localizeDeep, localizeText } from '@/lib/units'
import type { SwitcherSpot } from './spot-switcher'
import type { NearbyCam } from '@/lib/get-cams'
import { Container } from './ui'
import { ForecastCard, ForecastErrorCard, type ForecastEnvelope } from './forecast-card'
import { NearbySpots } from './nearby-spots'
import { SeenNearby } from './seen-nearby'
import type { Preferences } from '@/app/api/preferences/route'

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
  profile = null,
  nearbyLinkBase = '/share',
  userId,
  retryHref,
  backHref,
  backLabel,
  switcherSpots,
  children,
}: {
  /** Signed in: spots for the location bar's quick switcher. */
  switcherSpots?: SwitcherSpot[]
  forecast: ForecastEnvelope | null
  error: string | null
  /** Plain-language cause for the error card (lib/diagnose-api.ts). */
  errorReason?: string | null
  /** Nearby public live-cam links (lib/get-cams.ts). */
  cams?: NearbyCam[]
  /** The signed-in user's fishing profile (personalizes the card). */
  profile?: Preferences | null
  /** Where "Nearby spots today" links: /forecast (signed in) or /share. */
  nearbyLinkBase?: string
  /** Signed-in user, so nearby verdicts are personalized like this one. */
  userId?: string
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
  // apps/api writes its prose (summaries, reasons, regulations, place
  // names like "12 mi NW of …") in US units; show it in the reader's.
  const units = requestUnits()
  forecast = localizeDeep(forecast, units)
  switcherSpots = switcherSpots?.map((spot) => ({ ...spot, name: localizeText(spot.name, units) }))
  return (
    <main>
      <LocationBar
        backHref={backHref}
        backLabel={backLabel}
        label={forecast?.location.label ?? 'Forecast'}
        switcher={
          forecast && switcherSpots ? { currentId: forecast.location.id, spots: switcherSpots } : undefined
        }
      />

      <Container>
        <div className="flex flex-col gap-4 py-5 pb-16">
          {error && <ForecastErrorCard message={error} reason={errorReason} retryHref={retryHref} />}
          {forecast && (
            <ForecastCard
              forecast={forecast}
              cams={cams}
              profile={profile}
              nearby={
                <NearbySpots
                  locationId={forecast.location.id}
                  currentScore={forecast.conditions?.score?.score ?? null}
                  linkBase={nearbyLinkBase}
                  userId={userId}
                />
              }
              seen={<SeenNearby locationId={forecast.location.id} />}
            />
          )}
          {children}
        </div>
      </Container>
    </main>
  )
}
