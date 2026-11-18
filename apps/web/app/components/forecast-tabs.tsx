'use client'

import { useId, useRef, useState, useSyncExternalStore } from 'react'
import { cx } from './ui/cx'
import type { ForecastLayout } from '@/app/api/preferences/route'

/**
 * Splits the forecast below its headline card into a few short tabs
 * (Today / Conditions / Fish / Week) instead of one very long scroll.
 * Every section is server-rendered and stays in the page (inactive tabs
 * are just `hidden`), so switching is instant and nothing refetches.
 *
 * The open tab lives in the URL hash (#conditions), so a link or a
 * reload keeps it, and the browser's back button isn't spammed (the hash
 * is replaced, not pushed). Follows the WAI-ARIA tabs pattern: arrow
 * keys / Home / End move between tabs, and only the open tab is in the
 * tab order.
 *
 * Signed-in users can "Customize" the page: move a section up or down,
 * send it to another tab, or hide it. That arrangement is saved to their
 * profile (`forecast_layout`, a PATCH to /api/preferences), so it follows
 * them to every spot and device. Sections that render nothing for this
 * spot (no surf zone forecast here, say) collapse away, toolbar and all.
 */

export type ForecastTab = { key: string; label: string; hint?: string }

export type ForecastSection = {
  id: string
  label: string
  /** The tab it lives in by default. */
  tab: string
  content: React.ReactNode
}

const EMPTY_LAYOUT: ForecastLayout = { tabs: {}, hidden: [] }

/** Each tab's section ids, in order: the user's placements first, then
 * every other section still in its default tab, in default order. */
function arrange(tabs: ForecastTab[], sections: ForecastSection[], layout: ForecastLayout) {
  const known = new Set(sections.map((section) => section.id))
  const placed = new Set<string>()
  const result: Record<string, string[]> = {}
  for (const tab of tabs) {
    result[tab.key] = (layout.tabs[tab.key] ?? []).filter((id) => {
      if (!known.has(id) || placed.has(id)) return false
      placed.add(id)
      return true
    })
  }
  for (const section of sections) {
    if (!placed.has(section.id)) result[section.tab]?.push(section.id)
  }
  return result
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const TOOL_BUTTON =
  'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text hover:border-primary disabled:opacity-40 disabled:hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'

export function ForecastTabs({
  tabs,
  sections,
  layout: savedLayout = null,
  canCustomize = false,
}: {
  tabs: ForecastTab[]
  sections: ForecastSection[]
  layout?: ForecastLayout | null
  /** Signed in (the arrangement saves to their profile). */
  canCustomize?: boolean
}) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => '',
  )
  const active = tabs.find((tab) => tab.key === hash)?.key ?? tabs[0]?.key
  const [layout, setLayout] = useState<ForecastLayout>(savedLayout ?? EMPTY_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const beforeEdit = useRef<ForecastLayout>(layout)

  const byId = new Map(sections.map((section) => [section.id, section]))
  const placement = arrange(tabs, sections, layout)
  const hidden = new Set(layout.hidden)

  function open(key: string, focus = false) {
    const url = new URL(window.location.href)
    url.hash = key === tabs[0]?.key ? '' : key
    window.history.replaceState(window.history.state, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    if (focus) listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${key}"]`)?.focus()
    // If the tab bar has scrolled out of view, bring it back so the new
    // panel starts at the top of the screen.
    const bar = listRef.current
    if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start' })
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null
    if (next === null) return
    event.preventDefault()
    open(tabs[next].key, true)
  }

  /** Apply a change to the full arrangement (every tab spelled out). */
  function update(change: (tabs: Record<string, string[]>, hidden: Set<string>) => void) {
    const nextTabs = Object.fromEntries(Object.entries(placement).map(([key, ids]) => [key, [...ids]]))
    const nextHidden = new Set(hidden)
    change(nextTabs, nextHidden)
    setLayout({ tabs: nextTabs, hidden: [...nextHidden] })
  }

  function move(sectionId: string, tabKey: string, delta: number) {
    update((next) => {
      const ids = next[tabKey]
      const from = ids.indexOf(sectionId)
      const to = from + delta
      if (from < 0 || to < 0 || to >= ids.length) return
      ids.splice(from, 1)
      ids.splice(to, 0, sectionId)
    })
  }

  function sendTo(sectionId: string, fromTab: string, toTab: string) {
    update((next) => {
      next[fromTab] = next[fromTab].filter((sid) => sid !== sectionId)
      next[toTab].push(sectionId)
    })
  }

  function toggleHidden(sectionId: string) {
    update((_, nextHidden) => {
      if (nextHidden.has(sectionId)) nextHidden.delete(sectionId)
      else nextHidden.add(sectionId)
    })
  }

  async function save(next: ForecastLayout | null) {
    setSaveState('saving')
    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forecast_layout: next }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setSaveState('idle')
      return true
    } catch {
      setSaveState('error')
      return false
    }
  }

  function startEditing() {
    beforeEdit.current = layout
    setSaveState('idle')
    setEditing(true)
  }

  async function finishEditing() {
    if (await save(layout)) setEditing(false)
  }

  function cancelEditing() {
    setLayout(beforeEdit.current)
    setSaveState('idle')
    setEditing(false)
  }

  function resetLayout() {
    setLayout(EMPTY_LAYOUT)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      <div className="flex min-w-0 items-stretch gap-2">
        <div
          ref={listRef}
          role="tablist"
          aria-label="Forecast sections"
          className="grid min-w-0 flex-1 scroll-mt-20 gap-1 rounded-lg border border-border bg-surface p-1 shadow-card"
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
                  'flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-0.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  selected ? 'bg-primary text-primary-contrast' : 'text-text-muted hover:bg-surface-raised hover:text-text',
                )}
              >
                <span className="max-w-full truncate text-sm font-bold">{tab.label}</span>
                {tab.hint && (
                  <span className={cx('hidden max-w-full truncate text-[0.6875rem] sm:block', selected ? 'opacity-85' : 'opacity-75')}>
                    {tab.hint}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {canCustomize && !editing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Customize the forecast: move or hide sections"
            title="Customize: move or hide sections"
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-muted shadow-card hover:border-primary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:flex"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
            <span className="hidden md:inline">Customize</span>
          </button>
        )}
      </div>

      {canCustomize && !editing && (
        // Phones: the tab bar needs the full width, so Customize sits below it.
        <button
          type="button"
          onClick={startEditing}
          className="-mt-2 self-end text-xs font-semibold text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:hidden"
        >
          Customize this page
        </button>
      )}

      {editing && (
        <div
          role="region"
          aria-label="Customize the forecast"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary bg-surface px-4 py-3 shadow-card"
        >
          <p className="min-w-0 flex-1 text-sm text-text">
            <span className="font-semibold">Customizing.</span>{' '}
            <span className="text-text-muted">
              Move, hide or send sections to another tab.
              <span className="hidden sm:inline"> Switch tabs to arrange those too.</span>
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={resetLayout} className={TOOL_BUTTON}>
              Reset
            </button>
            <button type="button" onClick={cancelEditing} className={TOOL_BUTTON}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void finishEditing()}
              disabled={saveState === 'saving'}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-bold text-primary-contrast hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
            >
              {saveState === 'saving' ? 'Saving…' : 'Done'}
            </button>
          </div>
          {saveState === 'error' && (
            <p role="alert" className="w-full text-sm text-danger-text">
              Couldn&apos;t save your layout. Try again.
            </p>
          )}
        </div>
      )}

      {tabs.map((tab) => {
        const ids = placement[tab.key] ?? []
        const shown = ids.filter((sid) => !hidden.has(sid))
        const hiddenHere = ids.filter((sid) => hidden.has(sid))
        return (
          <div
            key={tab.key}
            role="tabpanel"
            id={`${id}-panel-${tab.key}`}
            aria-labelledby={`${id}-tab-${tab.key}`}
            hidden={tab.key !== active}
            className="flex min-w-0 flex-col gap-4 sm:gap-5"
          >
            {ids.map((sectionId, index) => {
              const section = byId.get(sectionId)
              if (!section) return null
              const isHidden = hidden.has(sectionId)
              // Hidden sections stay mounted (so un-hiding is instant)
              // but out of sight outside edit mode.
              return (
                <div
                  key={sectionId}
                  data-section={sectionId}
                  hidden={isHidden && !editing}
                  className={cx(
                    'flex min-w-0 flex-col gap-2 has-[>.section-body:empty]:hidden',
                    editing && 'rounded-lg border border-dashed border-border p-2',
                  )}
                >
                  {editing && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm font-semibold text-text">
                        {section.label}
                        {isHidden && <span className="ml-2 text-xs font-normal text-text-muted">Hidden</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(sectionId, tab.key, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${section.label} up`}
                        className={TOOL_BUTTON}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 19V5M6 11l6-6 6 6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => move(sectionId, tab.key, 1)}
                        disabled={index === ids.length - 1}
                        aria-label={`Move ${section.label} down`}
                        className={TOOL_BUTTON}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 5v14M6 13l6 6 6-6" />
                        </svg>
                      </button>
                      <label className="sr-only" htmlFor={`${id}-move-${sectionId}`}>
                        Move {section.label} to another tab
                      </label>
                      <select
                        id={`${id}-move-${sectionId}`}
                        value={tab.key}
                        onChange={(event) => sendTo(sectionId, tab.key, event.target.value)}
                        className="h-8 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        {tabs.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.key === tab.key ? `In ${option.label}` : `Move to ${option.label}`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => toggleHidden(sectionId)}
                        aria-pressed={isHidden}
                        className={TOOL_BUTTON}
                      >
                        {isHidden ? 'Show' : 'Hide'}
                      </button>
                    </div>
                  )}
                  <div className={cx('section-body flex min-w-0 flex-col', editing && isHidden && 'hidden')}>
                    {section.content}
                  </div>
                </div>
              )
            })}

            {!editing && shown.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
                Nothing on this tab.
                {canCustomize && ' Use Customize to move sections here.'}
              </p>
            )}
            {!editing && canCustomize && hiddenHere.length > 0 && (
              <p className="text-center text-xs text-text-muted">
                {hiddenHere.length} hidden section{hiddenHere.length > 1 ? 's' : ''} ·{' '}
                <button type="button" onClick={startEditing} className="font-semibold text-primary hover:underline">
                  Customize
                </button>
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
