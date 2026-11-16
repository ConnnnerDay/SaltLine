'use client'

import { useSyncExternalStore } from 'react'

/**
 * Dark/light switch, as in the original Saltline header. Dark is the
 * default (no attribute); light sets html[data-theme="light"] and is
 * remembered in localStorage, which app/layout.tsx's inline script
 * re-applies before first paint on the next visit.
 */
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readTheme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function ThemeToggle() {
  // null on the server (theme is only known client-side, after the
  // layout's bootstrap script ran), so the icon renders after hydration.
  const theme = useSyncExternalStore(subscribe, readTheme, () => null)

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    if (next === 'light') {
      document.documentElement.dataset.theme = 'light'
    } else {
      delete document.documentElement.dataset.theme
    }
    try {
      localStorage.setItem('theme', next)
    } catch {
      // Storage blocked (private mode): the choice just won't persist.
    }
    listeners.forEach((listener) => listener())
  }

  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Dark theme' : 'Light theme'}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 text-white/85 hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-header"
    >
      {/* Rendered only after mount so the icon matches the real theme. */}
      {theme !== null && (
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
          {isLight ? (
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          )}
        </svg>
      )}
    </button>
  )
}
