import { cx } from './ui/cx'

/**
 * The Saltline logomark (horizon line, sunrise arc, wave -- "where the
 * tide meets the shore") as a reusable component, extracted from the
 * one-off inline SVGs already hand-copied into app/icon.tsx (dark
 * favicon tile, hard-coded hex colors) and app/page.tsx's hero (white
 * lines on a photo). Neither of those needs to change -- they're each
 * tuned for a fixed background this component doesn't have -- but every
 * *new* place the mark shows up (the site header, the 404 page) should
 * share one definition rather than hand-copy a third variant. Lines use
 * `currentColor` (white on the navy header, body text elsewhere) and the
 * arc uses the original coral, so it reads on every background it sits on.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cx('shrink-0', className)}
    >
      <path
        d="M2 10 L22 10"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stroke-current"
      />
      <path
        d="M6 10 A6 6 0 0 1 18 10"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stroke-[#ff6b4a]"
      />
      <path
        d="M2 15 Q5 13 8 15 T14 15 T20 15"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stroke-current"
      />
    </svg>
  )
}
