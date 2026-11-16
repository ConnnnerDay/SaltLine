import { LocationBar } from './location-bar'
import { Card, Container } from './ui'

/**
 * The loading skeleton both forecast surfaces share
 * (app/forecast/[locationId]/loading.tsx and
 * app/share/[locationId]/loading.tsx) -- see
 * app/components/forecast-page-body.tsx's docstring for why there are
 * two pages at all. `backHref`/`backLabel` are the one real difference,
 * same as that component.
 */
export function ForecastLoadingBody({
  backHref,
  backLabel,
}: {
  backHref: string
  backLabel: string
}) {
  return (
    <main role="status" aria-live="polite">
      <span className="sr-only">Loading forecast…</span>

      <LocationBar backHref={backHref} backLabel={backLabel} label={null} />

      <Container>
        <div className="py-5 pb-16">
          <Card aria-hidden="true" className="flex flex-col gap-4">
            <div className="h-4 w-1/3 animate-pulse rounded bg-border" />

            <div className="flex flex-col gap-2">
              <div className="h-9 w-28 animate-pulse rounded bg-border" />
              <div className="h-16 animate-pulse rounded-lg bg-border" />
            </div>

            <div className="h-20 animate-pulse rounded-lg bg-border" />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="h-3 w-12 animate-pulse rounded bg-border" />
                  <div className="h-5 w-16 animate-pulse rounded bg-border" />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-border" />
              ))}
            </div>
          </Card>
        </div>
      </Container>
    </main>
  )
}
