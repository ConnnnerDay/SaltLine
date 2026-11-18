'use client'

import { useId, useRef, useSyncExternalStore } from 'react'
import { cx } from './ui/cx'

/**
 * Splits the forecast below its headline card into a few short tabs
 * (Today / Conditions / Fish / Week) instead of one very long scroll.
 * Every panel is server-rendered and stays in the page (inactive ones are
 * just `hidden`), so switching is instant and nothing refetches.
 *
 * The open tab lives in the URL hash (#conditions), so a link or a
 * reload keeps it, and the browser's back button isn't spammed (the hash
 * is replaced, not pushed). Follows the WAI-ARIA tabs pattern: arrow
 * keys / Home / End move between tabs, and only the open tab is in the
 * tab order.
 */

export type ForecastTab = {
  key: string
  label: string
  /** A short hint under the label on wider screens. */
  hint?: string
  content: React.ReactNode
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function ForecastTabs({ tabs }: { tabs: ForecastTab[] }) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => '',
  )
  const active = tabs.find((tab) => tab.key === hash)?.key ?? tabs[0]?.key

  function open(key: string, focus = false) {
    const url = new URL(window.location.href)
    url.hash = key === tabs[0]?.key ? '' : key
    window.history.replaceState(window.history.state, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    if (focus) listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${key}"]`)?.focus()
    // If the tab bar has scrolled out of view, bring it back so the new
    // panel starts at the top of the screen.
    const bar = listRef.current
    if (bar && bar.getBoundingClientRect().top < 0) {
      bar.scrollIntoView({ block: 'start' })
    }
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    open(tabs[next].key, true)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Forecast sections"
        className="grid scroll-mt-20 gap-1 rounded-lg border border-border bg-surface p-1 shadow-card"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab, index) => {
          const selected = tab.key === active
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.key}`}
              data-tab={tab.key}
              aria-selected={selected}
              aria-controls={`${id}-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(tab.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cx(
                'flex min-h-11 flex-col items-center justify-center rounded-md px-2 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                selected ? 'bg-primary text-primary-contrast' : 'text-text-muted hover:bg-surface-raised hover:text-text',
              )}
            >
              <span className="text-sm font-bold">{tab.label}</span>
              {tab.hint && (
                <span className={cx('hidden text-[0.6875rem] sm:block', selected ? 'opacity-85' : 'opacity-75')}>
                  {tab.hint}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${id}-panel-${tab.key}`}
          aria-labelledby={`${id}-tab-${tab.key}`}
          hidden={tab.key !== active}
          className="flex min-w-0 flex-col gap-4 sm:gap-5"
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
