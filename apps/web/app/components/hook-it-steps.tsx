'use client'

import type { BaitHow } from '@/lib/hook-bait'
import { localizeText, type Units } from '@/lib/units'
import { BaitArt, hasBaitArt } from './bait-art'

/** The opened content of HookIt: loaded only when someone opens it
 * (next/dynamic in hook-it.tsx), so the drawing code (bait-art.tsx,
 * ~25 KB) isn't in the forecast and fish pages' up-front JavaScript. */
export default function HookItSteps({ hows, units }: { hows: BaitHow[]; units: Units }) {
  const say = (text: string) => localizeText(text, units)
  return (
      <div className="mt-3 flex flex-col gap-4">
        {hows.map((how) => (
          <section key={how.id} className="flex flex-col gap-2">
            {hows.length > 1 && <h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{how.title}</h4>}
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-3">
              {how.steps.map((step, index) => {
                const badge = (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#1c1917] bg-[#ffd166] text-xs font-black text-[#1c1917]">
                    {index + 1}
                  </span>
                )
                return (
                  <li key={step} className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-surface-raised">
                    {hasBaitArt(how.id, index) ? (
                      <>
                        <div className="relative">
                          <BaitArt id={how.id} step={index} label={`${how.title}, step ${index + 1}: ${step}`} />
                          <span className="absolute left-2 top-2">{badge}</span>
                        </div>
                        <p className="px-3 py-2 text-sm leading-relaxed text-text">{say(step)}</p>
                      </>
                    ) : (
                      <div className="flex items-start gap-2 px-3 py-2">
                        {badge}
                        <p className="text-sm leading-relaxed text-text">{say(step)}</p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
  )
}
