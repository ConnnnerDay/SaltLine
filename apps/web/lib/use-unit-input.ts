'use client'

import { useState } from 'react'
import { fromDisplay, toDisplay, type Units } from './units'

type Kind = 'speed' | 'height' | 'weight' | 'length'

/**
 * A number input shown in the reader's units over a value stored in US
 * units (knots, feet, pounds, inches). Keeps the text exactly as typed
 * ("1." stays "1." mid-entry) and reports the converted value; re-fills
 * the text when the units switch or the value changes from outside (a
 * preset, a load).
 */
export function useUnitInput(
  stored: number | null,
  kind: Kind,
  units: Units,
  onChange: (value: number | null) => void,
): { value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void } {
  const show = (value: number | null) => (value === null ? '' : String(toDisplay[kind](value, units)))
  const [text, setText] = useState(() => show(stored))
  const [synced, setSynced] = useState({ units, stored })

  // Units switched, or the stored value changed without us: re-fill.
  if (synced.units !== units || synced.stored !== stored) {
    setSynced({ units, stored })
    setText(show(stored))
  }

  return {
    value: text,
    onChange: (event) => {
      const raw = event.target.value
      setText(raw)
      const parsed = raw.trim() === '' ? null : Number(raw)
      const next = parsed === null || !Number.isFinite(parsed) ? null : fromDisplay[kind](parsed, units)
      setSynced({ units, stored: next })
      onChange(next)
    },
  }
}
