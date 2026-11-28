'use client'

import { createContext, useContext, useState } from 'react'
import { cx } from './ui/cx'
import type { ForecastLayout } from '@/app/api/preferences/route'

/**
 * The signed-in user's forecast arrangement (`forecast_layout` in their
 * profile), shared by the parts of the forecast it shapes: the headline
 * stat tiles (`HeadlineStats`) and the tabbed sections (`ForecastTabs`,
 * which also hosts the Customize editor). Kept in one client context so a
 * change in the editor shows everywhere at once, before it's saved.
 */

export const EMPTY_LAYOUT: ForecastLayout = { tabs: {}, hidden: [] }

/** The headline tiles shown when the user hasn't picked their own. */
export const DEFAULT_STATS = ['water', 'wind', 'waves', 'confidence']
export const MAX_STATS = 4

export type StatTileData = {
  key: string
  label: string
  value: string
  note?: string
  /** Border-top color class for the tile. */
  rule: string
}

type LayoutState = {
  layout: ForecastLayout
  setLayout: (layout: ForecastLayout) => void
  editing: boolean
  setEditing: (editing: boolean) => void
  canCustomize: boolean
  /** Every headline stat available for this spot, in default order. */
  statOptions: { key: string; label: string }[]
}

const LayoutContext = createContext<LayoutState | null>(null)

export function useForecastLayout(): LayoutState {
  const state = useContext(LayoutContext)
  if (!state) throw new Error('useForecastLayout must be used inside ForecastLayoutProvider')
  return state
}

export function ForecastLayoutProvider({
  initial,
  canCustomize,
  statOptions,
  children,
}: {
  initial: ForecastLayout | null
  canCustomize: boolean
  statOptions: { key: string; label: string }[]
  children: React.ReactNode
}) {
  const [layout, setLayout] = useState<ForecastLayout>(initial ?? EMPTY_LAYOUT)
  const [editing, setEditing] = useState(false)
  return (
    <LayoutContext.Provider value={{ layout, setLayout, editing, setEditing, canCustomize, statOptions }}>
      {/* `data-density` drives the compact view: Card and the section
          stacks shrink their padding/gaps under it (in-data-[density=compact]). */}
      <div data-density={layout.compact ? 'compact' : 'comfortable'} className="contents">
        {children}
      </div>
    </LayoutContext.Provider>
  )
}

/** The stat keys to show: the user's pick (those available here), else
 * the defaults, topped up from the other options if some are missing. */
export function chosenStats(layout: ForecastLayout, available: string[]): string[] {
  const picked = (layout.stats ?? []).filter((key) => available.includes(key))
  if (picked.length > 0) return picked.slice(0, MAX_STATS)
  const defaults = DEFAULT_STATS.filter((key) => available.includes(key))
  const extra = available.filter((key) => !defaults.includes(key))
  return [...defaults, ...extra].slice(0, MAX_STATS)
}

const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
}

/** The headline card's row of stat tiles, as the user arranged them. */
export function HeadlineStats({ stats }: { stats: StatTileData[] }) {
  const { layout } = useForecastLayout()
  const byKey = new Map(stats.map((stat) => [stat.key, stat]))
  const keys = chosenStats(layout, stats.map((stat) => stat.key))
  if (keys.length === 0) return null
  return (
    <dl className={cx('grid gap-px border-t border-border bg-border', GRID_COLS[keys.length])}>
      {keys.map((key) => {
        const stat = byKey.get(key)!
        return (
          // One wrapper per dt/dd group: a <dl> allows a single <div>
          // around each group, and screen readers lose the pairing deeper.
          <div key={key} className={cx('flex h-full flex-col gap-1 border-t-2 bg-surface px-5 py-4 sm:px-6', stat.rule)}>
            <dt className="section-label">{stat.label}</dt>
            <dd className="text-2xl font-bold tracking-tight text-text">{stat.value}</dd>
            {stat.note && <dd className="text-xs text-text-muted">{stat.note}</dd>}
          </div>
        )
      })}
    </dl>
  )
}

type DisplayOption = 'show_summary' | 'show_weather' | 'biting_photos'

/** Renders its children unless the user turned this display option off
 * in Customize (all default to on). */
export function ShowIf({ option, children }: { option: DisplayOption; children: React.ReactNode }) {
  const { layout } = useForecastLayout()
  return layout[option] === false ? null : <>{children}</>
}

/** Renders the `index`-th "What's biting" pick only within the user's
 * chosen count (all, by default). */
export function WithinBitingCount({ index, children }: { index: number; children: React.ReactNode }) {
  const { layout } = useForecastLayout()
  return layout.biting_count && index >= layout.biting_count ? null : <>{children}</>
}
