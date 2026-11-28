'use client'

import { useState } from 'react'
import type { BaitHow } from '@/lib/hook-bait'
import dynamic from 'next/dynamic'
import type { Units } from '@/lib/units'

const HookItSteps = dynamic(() => import('./hook-it-steps'), {
  loading: () => <p className="mt-3 text-sm text-text-muted">Loading…</p>,
})

/** "How to hook it": a collapsed, step-by-step walkthrough of bait
 * how-tos (lib/hook-bait.ts): for each bait, one drawn panel per step
 * (bait-art.tsx) with the step as its caption, or just the caption when a
 * step has no drawing.
 *
 * The steps and drawings load and render only once the section is
 * opened (hook-it-steps.tsx): ~90 KB of SVG markup per forecast page and
 * ~25 KB of drawing code that most visits never need. */
export function HookIt({
  hows,
  units,
  label = 'How to hook it',
}: {
  hows: BaitHow[]
  units: Units
  label?: string
}) {
  const [opened, setOpened] = useState(false)
  if (hows.length === 0) return null
  return (
    <details className="group" onToggle={(event) => event.currentTarget.open && setOpened(true)}>
      <summary className="w-fit cursor-pointer text-sm font-semibold text-primary">{label}</summary>
      {opened && <HookItSteps hows={hows} units={units} />}
    </details>
  )
}
