'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { cx } from './ui/cx'

export type SwitcherSpot = { id: string; name: string; state: string; home?: boolean }

/**
 * The location name in the forecast's location bar doubles as a quick
 * switcher: tap it for your home spot and saved spots, one tap to jump
 * between them, plus "Find another spot". A disclosure button and a plain
 * list of links (not an ARIA menu), closed by Escape, an outside click,
 * or picking a spot.
 */
export function SpotSwitcher({
  label,
  currentId,
  spots,
}: {
  label: string
  currentId: string
  spots: SwitcherSpot[]
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={box} className="relative min-w-0">
      <h1 className="min-w-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="spot-switcher-list"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-base font-bold tracking-tight text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <span className="truncate">{label}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx('shrink-0 text-white/70 transition-transform', open && 'rotate-180')}>
            <path d="M6 9 L12 15 L18 9" />
          </svg>
          <span className="sr-only">, switch spot</span>
        </button>
      </h1>
      {open && (
        <div
          id="spot-switcher-list"
          className="absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface text-text shadow-card"
        >
          {spots.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {spots.map((spot) => {
                const current = spot.id === currentId
                return (
                  <li key={spot.id}>
                    <Link
                      href={`/forecast/${encodeURIComponent(spot.id)}`}
                      aria-current={current ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      className={cx(
                        'flex items-center justify-between gap-3 px-4 py-2.5 text-sm no-underline hover:bg-surface-raised',
                        current && 'bg-surface-raised',
                      )}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-text">{spot.name}</span>
                        {spot.state && <span className="text-text-muted">, {spot.state}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-text-muted">
                        {current ? 'Viewing' : spot.home ? 'Home' : ''}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-text-muted">
              Save spots to jump between them from here.
            </p>
          )}
          <Link
            href="/locations"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-sm font-semibold text-primary no-underline hover:bg-surface-raised"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            Find another spot
          </Link>
        </div>
      )}
    </div>
  )
}
