import Link from 'next/link'
import { SpotSwitcher, type SwitcherSpot } from './spot-switcher'

/**
 * The original Saltline location bar: a slim navy strip under the
 * header with a back link, a map-pin, and the location name. Shared by
 * forecast-page-body.tsx and forecast-loading-body.tsx (pass
 * `label={null}` for the loading skeleton's placeholder).
 */
export function LocationBar({
  backHref,
  backLabel,
  label,
  switcher,
  actions,
}: {
  backHref: string
  backLabel: string
  label: string | null
  /** Signed in: the name opens a switcher of these spots. */
  switcher?: { currentId: string; spots: SwitcherSpot[] }
  /** Spot actions on the right (signed in: save this spot). */
  actions?: React.ReactNode
}) {
  return (
    <div className="border-b border-header-border bg-header text-white">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-white/85 no-underline hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5 L8 12 L15 19" />
          </svg>
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-white/70">
          <circle cx="12" cy="10" r="3" />
          <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.1 11.5 7.4 11.8a1 1 0 0 0 1.2 0C12.9 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" />
        </svg>
        {label === null ? (
          <div aria-hidden="true" className="h-4 w-48 animate-pulse rounded bg-white/20" />
        ) : switcher ? (
          <SpotSwitcher label={label} currentId={switcher.currentId} spots={switcher.spots} />
        ) : (
          <h1 className="truncate text-base font-bold tracking-tight text-white">{label}</h1>
        )}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
