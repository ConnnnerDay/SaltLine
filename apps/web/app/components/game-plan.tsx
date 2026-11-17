import type { Preferences } from '@/app/api/preferences/route'
import { buildGamePlan, type PlanStep } from '@/lib/game-plan'
import type { ForecastEnvelope } from './forecast-card'
import { Card } from './ui'

/** "Today's game plan" (lib/game-plan.ts): the forecast as five steps. */

const ICONS: Record<PlanStep['key'], React.ReactNode> = {
  when: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  where: (
    <>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.1 11.5 7.4 11.8a1 1 0 0 0 1.2 0C12.9 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" />
    </>
  ),
  what: (
    <>
      <path d="M3 12c3-4 7-6 11-6 2.5 0 4.5 1 6 2l2-2v12l-2-2c-1.5 1-3.5 2-6 2-4 0-8-2-11-6z" />
      <circle cx="15.5" cy="10.5" r="0.8" fill="currentColor" />
    </>
  ),
  rig: <path d="M12 2v13a4 4 0 1 1-8 0v-1M12 2l-2 2M12 2l2 2" />,
  watch: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
}

export function GamePlan({
  forecast,
  profile = null,
  now,
}: {
  forecast: ForecastEnvelope
  profile?: Preferences | null
  now: Date
}) {
  const steps = buildGamePlan(forecast, profile, now)
  if (steps.length < 2) return null
  return (
    <Card className="flex flex-col gap-4 border-l-4 border-l-primary">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Today&apos;s game plan</h2>
        <span className="text-xs text-text-muted">
          {profile ? 'Built from this forecast and your profile' : 'Built from this forecast'}
        </span>
      </div>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-raised p-3.5"
          >
            <span className="flex items-center gap-2 text-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS[step.key]}
              </svg>
              <span className="section-label text-primary!">{step.title}</span>
            </span>
            <p className="text-sm leading-relaxed text-text">{step.text}</p>
          </li>
        ))}
      </ol>
    </Card>
  )
}
