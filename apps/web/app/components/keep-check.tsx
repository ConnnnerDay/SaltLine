'use client'

import { useId, useState } from 'react'
import { cx } from './ui/cx'
import { MeasureArt } from './how-art'
import { MEASURE_HOW, parseSizeRule } from '@/lib/size-rule'
import { length as showLength, localizeText, unitLabel, type Units } from '@/lib/units'
import { useUnitInput } from '@/lib/use-unit-input'

export type KeepOption = {
  key: string
  /** What the picker shows: a fish name (forecast) or a state (fish page). */
  label: string
  state: string
  min_size: string | null
  bag_limit: string | null
  season: string | null
  notes: string | null
  source_url: string | null
}

const TONE = {
  keep: 'border-go-border bg-go-bg text-go-text',
  short: 'border-nogo-border bg-nogo-bg text-nogo-text',
  long: 'border-nogo-border bg-nogo-bg text-nogo-text',
  release: 'border-nogo-border bg-nogo-bg text-nogo-text',
  check: 'border-marginal-border bg-marginal-bg text-marginal-text',
} as const

/**
 * "Can I keep it?": pick the fish (or state), type the length you
 * measured, and get keep / too short / over the slot / can't keep, read
 * from the state's size rule in the regulations snapshot, with how to
 * measure for that rule. Anything the rule text doesn't make clear says to
 * check the official rules rather than guess.
 */
export function KeepCheck({
  options,
  initialKey,
  units,
  asOf,
}: {
  options: KeepOption[]
  initialKey?: string
  units: Units
  asOf?: string
}) {
  const [key, setKey] = useState(initialKey ?? options[0]?.key)
  const [inches, setInches] = useState<number | null>(null)
  const input = useUnitInput(inches, 'length', units, setInches)
  const ids = useId()
  const option = options.find((entry) => entry.key === key) ?? options[0]
  if (!option) return null
  const rule = parseSizeRule(option)
  const say = (text: string) => localizeText(text, units)
  const size = (value: number) => showLength(value, units)
  // "18–27 in" / "46–69 cm": one unit for the pair.
  const span = (low: number, high: number) => {
    const [a, unit] = size(low).split(' ')
    return `${a}–${size(high).split(' ')[0]} ${unit}`
  }

  let verdict: { tone: keyof typeof TONE; title: string; detail?: string } | null = null
  if (rule.kind === 'prohibited') {
    verdict = { tone: 'release', title: `Release it: can’t be kept in ${option.state}`, detail: say(option.notes || option.bag_limit || '') || undefined }
  } else if (rule.kind === 'unknown') {
    verdict = { tone: 'check', title: `Check ${option.state}’s rules`, detail: option.min_size ? say(option.min_size) : undefined }
  } else if (rule.kind === 'none') {
    verdict = {
      tone: 'keep',
      title: `No minimum size in ${option.state}`,
      detail: option.bag_limit ? `Bag limit: ${say(option.bag_limit)}` : undefined,
    }
  } else if (inches !== null && inches > 0) {
    const slot = rule.max !== null ? span(rule.min, rule.max) : null
    const close = Math.abs(inches - rule.min) < 0.5 || (rule.max !== null && Math.abs(inches - rule.max) < 0.5)
    if (inches < rule.min) {
      verdict = { tone: 'short', title: 'Too short, release it', detail: `${option.state} needs ${size(rule.min)}${slot ? ` (slot ${slot})` : ''}. Yours is ${size(inches)}.` }
    } else if (rule.max !== null && inches > rule.max) {
      verdict = { tone: 'long', title: 'Over the slot, release it', detail: `${option.state}’s slot is ${slot}. Yours is ${size(inches)}.` }
    } else {
      verdict = {
        tone: 'keep',
        title: slot ? 'In the slot' : 'Legal size',
        detail: `${size(inches)} ${slot ? `is inside ${option.state}’s ${slot} slot` : `meets ${option.state}’s ${size(rule.min)} minimum`}.${option.bag_limit ? ` Bag limit: ${say(option.bag_limit)}.` : ''}`,
      }
    }
    if (close) verdict.detail = `${verdict.detail} That’s within half ${units === 'metric' ? 'a centimetre or so' : 'an inch'} of the limit, so measure again.`
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3 sm:p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-bold text-text">Can I keep it?</h3>
        <p className="text-xs text-text-muted">Measure your fish and check it against the size limit.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {options.length > 1 && (
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-text-muted" htmlFor={`${ids}-pick`}>
            {options[0].label === options[0].state ? 'State' : 'Fish'}
            <select
              id={`${ids}-pick`}
              value={option.key}
              onChange={(event) => setKey(event.target.value)}
              className="min-h-10 max-w-full rounded-md border border-border bg-surface px-2.5 text-sm text-text"
            >
              {options.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {rule.kind === 'size' && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted" htmlFor={`${ids}-len`}>
            Length ({unitLabel('length', units)})
            <input
              id={`${ids}-len`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.25"
              placeholder={String(units === 'metric' ? Math.round(rule.min * 2.54) : rule.min)}
              {...input}
              className="min-h-10 w-28 rounded-md border border-border bg-surface px-2.5 text-sm tabular-nums text-text"
            />
          </label>
        )}
      </div>

      {rule.kind === 'size' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="w-full max-w-56 shrink-0 empty:hidden">
            <MeasureArt measure={rule.measure} />
          </div>
          <p className="text-xs leading-relaxed text-text-muted">
            <span className="font-semibold text-text">
              {option.state}: {rule.max !== null ? `${span(rule.min, rule.max)} slot` : `${size(rule.min)} minimum`}.
            </span>{' '}
            {MEASURE_HOW[rule.measure]}
          </p>
        </div>
      )}

      {verdict && (
        <div role="status" className={cx('flex flex-col gap-0.5 rounded-md border px-3 py-2', TONE[verdict.tone])}>
          <span className="text-sm font-bold">{verdict.title}</span>
          {verdict.detail && <span className="text-xs">{verdict.detail}</span>}
        </div>
      )}

      {rule.kind === 'size' && rule.varies && (
        <p className="text-xs text-marginal-text">Limits differ by area or may have changed in {option.state}. Confirm with the official rules.</p>
      )}
      {option.season && !/year.round|^open$/i.test(option.season) && (
        <p className="text-xs text-text-muted">
          <span className="font-semibold text-text">Season: </span>
          {say(option.season)}
        </p>
      )}
      <p className="text-[0.6875rem] text-text-muted">
        {asOf ? `From the ${asOf} regulations snapshot. ` : ''}A guide, not legal advice.
        {option.source_url && (
          <>
            {' '}
            <a href={option.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold">
              Official {option.state} rules ↗
            </a>
          </>
        )}
      </p>
    </div>
  )
}
