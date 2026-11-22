import { formatAsOf, type SeasonStatus } from '@/lib/regulations'
import { cx } from './ui/cx'


const TONE: Record<Exclude<SeasonStatus, 'open'>, string> = {
  prohibited: 'border-nogo-border bg-nogo-bg text-nogo-text',
  closed: 'border-nogo-border bg-nogo-bg text-nogo-text',
  release_only: 'border-marginal-border bg-marginal-bg text-marginal-text',
  check: 'border-border bg-surface text-text-muted',
}

/**
 * "No harvest: release it", "Closed season now: opens in July",
 * "Catch-and-release only" or "Season varies: check…" on a fish whose
 * snapshot season matters this month. Nothing for an open season, so the
 * badge only shows when it should change what the angler keeps.
 */
export function SeasonBadge({
  status,
  note,
  quiet = false,
  className,
}: {
  status?: SeasonStatus | null
  note?: string | null
  /** Skip "check" (vague) notes where space is tight. */
  quiet?: boolean
  className?: string
}) {
  if (!status || status === 'open' || !note) return null
  if (quiet && status === 'check') return null
  return (
    <span
      className={cx(
        'inline-block w-fit rounded-full border px-2 py-0.5 text-xs font-bold leading-snug',
        TONE[status],
        className,
      )}
    >
      {status === 'check' ? note : `⚠ ${note}`}
    </span>
  )
}

/** The louder "these limits may be out of date" line shown once wherever
 * limits are listed and the snapshot is over six months old. `asOf` is
 * the raw "YYYY-MM". */
export function StaleLimitsWarning({ asOf, className }: { asOf: string; className?: string }) {
  return (
    <p
      role="note"
      className={cx(
        'rounded-md border border-marginal-border bg-marginal-bg px-3 py-2 text-sm text-marginal-text',
        className,
      )}
    >
      <span className="font-bold">These limits may be out of date.</span> They&apos;re from the {formatAsOf(asOf)}{' '}
      snapshot, and states change size, bag and season rules often. Check the official rules before you keep a fish.
    </p>
  )
}
