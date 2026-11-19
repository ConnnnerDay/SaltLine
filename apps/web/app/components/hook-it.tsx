import type { BaitHow } from '@/lib/hook-bait'
import { BaitArt } from './bait-art'

/** "How to hook it": a collapsed, comic-strip walkthrough of bait
 * how-tos (lib/hook-bait.ts): for each bait, one drawn panel per step
 * (bait-art.tsx) with the step as its caption. Works in server and client
 * components. */
export function HookIt({
  hows,
  say,
  label = 'How to hook it',
}: {
  hows: BaitHow[]
  say: (text: string) => string
  label?: string
}) {
  if (hows.length === 0) return null
  return (
    <details className="group">
      <summary className="w-fit cursor-pointer text-sm font-semibold text-primary">{label}</summary>
      <div className="mt-3 flex flex-col gap-4">
        {hows.map((how) => (
          <section key={how.id} className="flex flex-col gap-2">
            {hows.length > 1 && <h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{how.title}</h4>}
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-3">
              {how.steps.map((step, index) => (
                <li key={step} className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-surface-raised">
                  <div className="relative">
                    <BaitArt id={how.id} step={index} label={`${how.title}, step ${index + 1}: ${step}`} />
                    <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1c1917] bg-[#ffd166] text-xs font-black text-[#1c1917]">
                      {index + 1}
                    </span>
                  </div>
                  <p className="px-3 py-2 text-sm leading-relaxed text-text">{say(step)}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </details>
  )
}
