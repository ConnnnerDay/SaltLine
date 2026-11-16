import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export type BadgeVariant = 'go' | 'marginal' | 'nogo' | 'neutral'

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  go: 'bg-go-bg text-go-text border-go-border',
  marginal: 'bg-marginal-bg text-marginal-text border-marginal-border',
  nogo: 'bg-nogo-bg text-nogo-text border-nogo-border',
  neutral: 'bg-surface text-text-muted border-border',
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

/** Status pill (sprint 27's design-system gallery). Backs sprint 32's
 * go/no-go traffic-light dashboard headline: `variant` sets color, but
 * the verdict itself is always the visible text label passed as
 * *children* -- never conveyed by color alone. The leading dot is
 * `aria-hidden`, a purely decorative reinforcement.
 */
export function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
