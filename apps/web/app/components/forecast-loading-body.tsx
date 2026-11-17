import { LocationBar } from './location-bar'
import { Card, Container } from './ui'
import { cx } from './ui/cx'

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
        {/* Mirrors ForecastCard's layout (headline + stat strip, activity
            chart, when-to-fish tiles, species cards) so nothing jumps
            when the real forecast replaces it. */}
        <div aria-hidden="true" className="flex flex-col gap-4 py-5 pb-16 sm:gap-5">
          <Card className="overflow-hidden p-0!">
            <div className="flex flex-col gap-3 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
              <Bone className="h-3 w-28" />
              <Bone className="h-10 w-64 sm:h-12" />
              <Bone className="h-4 w-full max-w-xl" />
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-2 bg-surface px-5 py-4 sm:px-6">
                  <Bone className="h-3 w-16" />
                  <Bone className="h-7 w-24" />
                  <Bone className="h-3 w-14" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <Bone className="h-3 w-40" />
            <div className="flex h-36 items-end gap-1.5 sm:h-44">
              {Array.from({ length: 24 }, (_, i) => (
                <Bone
                  key={i}
                  className="flex-1 rounded-b-none"
                  style={{ height: `${25 + ((i * 37) % 60)}%` }}
                />
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <Bone className="h-3 w-24" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Bone className="h-24" />
              <Bone className="h-24" />
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <Bone className="h-3 w-28" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Bone key={i} className="h-72" />
              ))}
            </div>
          </Card>
        </div>
      </Container>
    </main>
  )
}

/** One skeleton block: a softly pulsing surface-toned shape. */
function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx('animate-pulse rounded-md bg-border/70', className)} style={style} />
}
