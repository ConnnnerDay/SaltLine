import Link from 'next/link'
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
          <div aria-hidden="true" className="h-8 w-2/3 max-w-xs animate-pulse rounded-md bg-white/30 sm:h-9" />
        </div>
      </div>

      <Container>
        <div className="py-6 pb-16">
          <Card aria-hidden="true" className="flex flex-col gap-4">
            <div className="h-4 w-1/3 animate-pulse rounded bg-border" />

            <div className="flex flex-col gap-2">
              <div className="h-9 w-28 animate-pulse rounded-full bg-border" />
              <div className="h-16 animate-pulse rounded-[1.25rem] bg-border" />
            </div>

            <div className="h-20 animate-pulse rounded-[1.25rem] bg-border" />

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
