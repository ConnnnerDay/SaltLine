import type { BaitHow } from '@/lib/hook-bait'

/** "How to hook it": a collapsed list of bait how-tos (lib/hook-bait.ts),
 * each with its steps. Works in server and client components. */
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
      <div className="mt-2 flex flex-col gap-3">
        {hows.map((how) => (
          <section key={how.id} className="flex flex-col gap-1">
            {hows.length > 1 && <h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{how.title}</h4>}
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-text">
              {how.steps.map((step) => (
                <li key={step}>{say(step)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}
