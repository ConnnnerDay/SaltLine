'use client'

import { useState } from 'react'
import type { HourlyOutlook } from './forecast-card'
import { cx } from './ui/cx'

/**
 * The "Fishing activity" column chart: one column per hour, height =
 * apps/api's 0-100 activity level, colored on an ordinal ramp (low ->
 * good -> high in one blue hue, prime in coral -- see globals.css'
 * --color-tier-*). Built to the dataviz mark specs: columns capped
 * narrower than their slot (HTML boxes, so they stay crisp at any
 * width), 4px rounded tops, square at the baseline,
 * hairline recessive gridlines, a legend for the four tiers.
 *
 * Hover (or touch-drag) anywhere over the plot picks the hour under the
 * pointer, dims the rest and fills the readout line above the plot;
 * with nothing picked, the readout shows the current hour. The whole
 * figure stays `aria-hidden` with nothing focusable inside it: the
 * "Hour by hour" table is its accessible equivalent.
 */

const SHORT_HOURS = [
  '12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a',
  '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p',
]

const LONG_HOURS = SHORT_HOURS.map((label) =>
  label.replace(/^(\d+)a$/, '$1 AM').replace(/^(\d+)p$/, '$1 PM'),
)

// Activity words, not the day's verdict words (Good, Fair...), so an
// hour's activity is never confused with the day's rating.
const TAG_LABEL = { prime: 'Prime', high: 'Active', med: 'Moderate', low: 'Slow' } as const

const TIER_BG = {
  prime: 'bg-tier-prime',
  high: 'bg-tier-high',
  med: 'bg-tier-med',
  low: 'bg-tier-low',
} as const

const LEGEND = [
  { tag: 'low', swatch: 'bg-tier-low' },
  { tag: 'med', swatch: 'bg-tier-med' },
  { tag: 'high', swatch: 'bg-tier-high' },
  { tag: 'prime', swatch: 'bg-tier-prime' },
] as const

export function HourlyChart({ outlook }: { outlook: HourlyOutlook }) {
  const [picked, setPicked] = useState<number | null>(null)
  const nowIndex = outlook.hours.findIndex((hour) => hour.is_now)
  const shown = picked ?? (nowIndex >= 0 ? nowIndex : null)
  const shownHour = shown === null ? null : outlook.hours[shown]

  function pick(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const index = Math.floor(((event.clientX - box.left) / box.width) * outlook.hours.length)
    setPicked(Math.min(outlook.hours.length - 1, Math.max(0, index)))
  }

  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {/* Readout: always one line tall, so hovering never shifts layout. */}
      <p className="flex min-h-6 flex-wrap items-baseline gap-x-2 text-sm">
        {shownHour && (
          <>
            <span className="font-bold text-text">
              {picked === null ? 'Now' : LONG_HOURS[shownHour.hour]}
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-text">
              <span
                className={cx(
                  'h-2.5 w-2.5 rounded-sm',
                  LEGEND.find((item) => item.tag === shownHour.tag)?.swatch,
                )}
              />
              {TAG_LABEL[shownHour.tag]} · {shownHour.level}/100
            </span>
            {shownHour.reasons.length > 0 && (
              <span className="text-text-muted">{shownHour.reasons.join(' · ')}</span>
            )}
          </>
        )}
      </p>

      <div
        className="relative h-36 cursor-crosshair touch-pan-y select-none sm:h-44"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setPicked(null)}
      >
        {/* Hairline gridlines at 25/50/75/100, recessive. */}
        {[25, 50, 75, 100].map((level) => (
          <span
            key={level}
            className="absolute inset-x-0 h-px bg-grid"
            style={{ bottom: `${level}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end border-b border-border">
          {outlook.hours.map((hour, index) => {
            const dim = picked !== null && picked !== index
            return (
              <div
                key={hour.hour}
                className={cx(
                  'relative flex h-full flex-1 items-end justify-center',
                  hour.is_now && 'rounded-t-md bg-text/[0.06]',
                )}
              >
                <div
                  className={cx(
                    'relative w-[62%] max-w-[18px] rounded-t-[4px] transition-[opacity,height] duration-300',
                    TIER_BG[hour.tag],
                    dim && 'opacity-35',
                  )}
                  style={{ height: `${Math.max(2, hour.level * 0.92)}%` }}
                >
                  {hour.peak && (
                    <span className="absolute -top-3.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-amber ring-2 ring-surface" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Axis labels in HTML (crisp text at any width): every 6 hours on
          phones, every 3 on wider screens, plus "Now". */}
      <div className="relative h-4 text-xs tabular-nums text-text-muted">
        {outlook.hours.map((hour, index) => {
          const every3 = index % 3 === 0
          const every6 = index % 6 === 0
          if (!hour.is_now && !every3) return null
          return (
            <span
              key={`axis-${hour.hour}`}
              className={cx(
                'absolute top-0 -translate-x-1/2 whitespace-nowrap',
                hour.is_now ? 'font-bold text-accent' : !every6 && 'hidden sm:inline',
                !hour.is_now && Math.abs(index - nowIndex) < 3 && nowIndex >= 0 && 'invisible',
              )}
              style={{ left: `${((index + 0.5) / outlook.hours.length) * 100}%` }}
            >
              {hour.is_now ? 'Now' : SHORT_HOURS[hour.hour]}
            </span>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        {LEGEND.map((item) => (
          <span key={item.tag} className="flex items-center gap-1.5">
            <span className={cx('h-2.5 w-2.5 rounded-sm', item.swatch)} />
            {TAG_LABEL[item.tag]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber" />
          Day&apos;s peak
        </span>
        <span className="ml-auto hidden sm:inline">Hover a column for details</span>
      </div>
    </div>
  )
}
