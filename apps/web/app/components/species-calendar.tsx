'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from './ui/cx'

/** One row of `FishingGuidance.calendar` (apps/api): 12 levels, Jan first. */
export type CalendarRow = { id: string; name: string; months: ('peak' | 'good' | '')[] }

const _MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const _MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The original "Species calendar": every target species for the region,
 * month by month -- peak (coral), good (blue) or off. A real table, so
 * screen readers get each cell's level as text (the colored block is
 * decorative); the current month's column is outlined.
 */
const CALENDAR_ROWS = 12

export function SpeciesCalendar({
  rows,
  currentMonth,
  linkFish = false,
}: {
  rows: CalendarRow[]
  currentMonth: number
  /** Signed in: names open the Fish guide (the public share page has none). */
  linkFish?: boolean
}) {
  // Built only once the surrounding collapsible is opened (~290 KB of
  // table markup for a region's full species list, sent in every page's
  // HTML otherwise, though most visits never open it).
  const ref = useRef<HTMLDivElement>(null)
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    const details = ref.current?.closest('details')
    if (!details) return setOpened(true)
    if (details.open) return setOpened(true)
    const onToggle = () => details.open && setOpened(true)
    details.addEventListener('toggle', onToggle)
    return () => details.removeEventListener('toggle', onToggle)
  }, [])
  if (!opened) return <div ref={ref} />
  // In season now first (peak, then good, then off), catalogue order
  // within each; the first CALENDAR_ROWS show, the rest on request.
  const rank = (row: (typeof rows)[number]) =>
    row.months[currentMonth - 1] === 'peak' ? 0 : row.months[currentMonth - 1] === 'good' ? 1 : 2
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row)
  const extra = sorted.length - CALENDAR_ROWS
  return (
    <div ref={ref} className="group flex min-w-0 flex-col gap-3">
      <div className="relative max-w-full overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-left text-sm sm:w-auto">
          <caption className="sr-only">Peak and good months for each species in this area</caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="py-1 pr-3 font-medium">
                Species
              </th>
              {_MONTH_INITIALS.map((initial, index) => (
                <th
                  key={index}
                  scope="col"
                  className={cx(
                    'w-7 py-1 text-center text-xs font-bold sm:w-9',
                    index + 1 === currentMonth && 'text-accent',
                  )}
                >
                  <abbr title={_MONTH_NAMES[index]} className="no-underline">
                    {initial}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, rowIndex) => (
              <tr
                key={row.id}
                className={cx(rowIndex >= CALENDAR_ROWS && 'hidden group-has-[details[open]]:table-row')}
              >
                <th scope="row" className="whitespace-nowrap py-0.5 pr-6 font-semibold text-text">
                  {linkFish ? (
                    <a href={`/fish/${encodeURIComponent(row.id)}`} className="text-text no-underline hover:underline">
                      {row.name}
                    </a>
                  ) : (
                    row.name
                  )}
                </th>
                {row.months.map((level, index) => (
                  <td key={index} className="px-0.5 py-0.5">
                    <span
                      className={cx(
                        'block h-5 rounded-sm',
                        level === 'peak' && 'bg-tier-prime',
                        level === 'good' && 'bg-tier-high',
                        level === '' && 'bg-tier-low',
                        index + 1 === currentMonth && 'ring-2 ring-text',
                      )}
                    />
                    <span className="sr-only">
                      {_MONTH_NAMES[index]}: {level === 'peak' ? 'peak' : level === 'good' ? 'good' : 'off'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {extra > 0 && (
        <details>
          <summary className="w-fit cursor-pointer text-sm font-semibold text-primary">
            <span className="group-has-[details[open]]:hidden">Show all {sorted.length} species</span>
            <span className="hidden group-has-[details[open]]:inline">Show fewer</span>
          </summary>
        </details>
      )}
      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-tier-prime" /> Peak
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-tier-high" /> Good
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-tier-low" /> Off season
        </span>
      </div>
    </div>
  )
}
