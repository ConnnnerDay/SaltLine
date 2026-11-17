'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import { LocationSearch } from '@/app/components/location-search'
import type { LocationSearchResult } from '@/app/api/locations/search/route'
import { COMFORT_PRESETS, FISHING_TYPES, type Gear } from '@/lib/profile-options'

const STEP_TITLES = [
  'Where do you fish most?',
  'How do you fish?',
  'What do you fish with?',
  'Your comfort limits',
  'Your experience',
]

const CHIP =
  'rounded-md border px-3 py-2 text-sm font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        CHIP,
        selected
          ? 'border-primary bg-primary text-primary-contrast'
          : 'border-border bg-surface text-text-muted hover:border-primary',
      )}
    >
      {children}
    </button>
  )
}

function GearRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: Gear | null
  onChange: (value: Gear) => void
}) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <span className="text-sm font-medium text-text">{label}</span>
      <div className="flex gap-2">
        {(['yes', 'sometimes', 'no'] as const).map((option) => (
          <Chip key={option} selected={value === option} onClick={() => onChange(option)}>
            {option === 'yes' ? 'Yes' : option === 'sometimes' ? 'Sometimes' : 'No'}
          </Chip>
        ))}
      </div>
    </div>
  )
}

/**
 * The setup wizard. Five short steps, each skippable; "Finish" saves
 * everything in one PATCH (marking the profile complete) and goes to the
 * home spot's forecast, or to search if no spot was picked.
 */
export function ProfileSetup({ next }: { next: string }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [home, setHome] = useState<LocationSearchResult | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [lures, setLures] = useState<Gear | null>(null)
  const [liveBait, setLiveBait] = useState<Gear | null>(null)
  const [cutBait, setCutBait] = useState<Gear | null>(null)
  const [comfort, setComfort] = useState<string | null>(null)
  const [wind, setWind] = useState('')
  const [surf, setSurf] = useState('')
  const [experience, setExperience] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLast = step === STEP_TITLES.length - 1

  async function save(body: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error()
      router.push(home ? `/forecast/${encodeURIComponent(home.id)}` : next)
      router.refresh()
    } catch {
      setError('Could not save your profile. Try again.')
      setSaving(false)
    }
  }

  function finish() {
    const number = (text: string) => (text.trim() === '' ? undefined : Number(text))
    save({
      ...(home ? { default_location_id: home.id } : {}),
      ...(types.length ? { fishing_types: types } : {}),
      ...(lures ? { uses_lures: lures } : {}),
      ...(liveBait ? { uses_live_bait: liveBait } : {}),
      ...(cutBait ? { uses_cut_bait: cutBait } : {}),
      ...(number(wind) !== undefined ? { wind_threshold_kt: number(wind) } : {}),
      ...(number(surf) !== undefined ? { surf_threshold_ft: number(surf) } : {}),
      ...(experience ? { experience } : {}),
      profile_completed: true,
    })
  }

  function choosePreset(value: string) {
    const preset = COMFORT_PRESETS.find((candidate) => candidate.value === value)
    if (!preset) return
    setComfort(value)
    setWind(String(preset.wind))
    setSurf(String(preset.surf))
  }

  return (
    <Card className="flex min-h-[26rem] flex-col gap-5 p-6!">
      <div className="flex items-center justify-between gap-3">
        <p className="section-label" aria-live="polite">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
        <button
          type="button"
          onClick={() => save({ profile_completed: true })}
          disabled={saving}
          className="text-sm font-semibold text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Skip setup
        </button>
      </div>
      <h1 className="text-2xl font-bold text-text sm:text-3xl">{STEP_TITLES[step]}</h1>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            Your home spot is the forecast Saltline opens to. You can change it any time.
          </p>
          <LocationSearch onSelect={setHome} label="Search for your spot" />
          {home && (
            <p className="text-sm text-text" role="status">
              Home spot: <span className="font-bold">{home.name}, {home.state}</span>
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">Pick all that apply.</p>
          <div className="flex flex-wrap gap-2">
            {FISHING_TYPES.map((type) => (
              <Chip
                key={type.value}
                selected={types.includes(type.value)}
                onClick={() =>
                  setTypes((current) =>
                    current.includes(type.value)
                      ? current.filter((value) => value !== type.value)
                      : [...current, type.value],
                  )
                }
              >
                {type.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            &quot;Pack for today&quot; will only suggest what you actually use.
          </p>
          <GearRow label="Lures" value={lures} onChange={setLures} />
          <GearRow label="Live bait" value={liveBait} onChange={setLiveBait} />
          <GearRow label="Cut bait" value={cutBait} onChange={setCutBait} />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Days over your limits get flagged and rated a step lower.
          </p>
          <div className="flex flex-wrap gap-2">
            {COMFORT_PRESETS.map((preset) => (
              <Chip
                key={preset.value}
                selected={comfort === preset.value}
                onClick={() => choosePreset(preset.value)}
              >
                {preset.label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">Max wind (kt)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={wind}
                onChange={(event) => {
                  setWind(event.target.value)
                  setComfort(null)
                }}
                className="rounded-md border border-border bg-surface px-3 py-2.5 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">Max surf (ft)</span>
              <input
                type="number"
                min="0"
                max="60"
                step="0.5"
                value={surf}
                onChange={(event) => {
                  setSurf(event.target.value)
                  setComfort(null)
                }}
                className="rounded-md border border-border bg-surface px-3 py-2.5 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </label>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Experience">
            {(
              [
                ['beginner', 'Just starting out'],
                ['intermediate', 'I know the basics'],
                ['experienced', 'Experienced'],
              ] as const
            ).map(([value, label]) => (
              <Chip key={value} selected={experience === value} onClick={() => setExperience(value)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1" />
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="flex justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0 || saving}
        >
          Back
        </Button>
        {isLast ? (
          <Button type="button" variant="primary" onClick={finish} disabled={saving}>
            {saving ? 'Saving…' : 'Finish'}
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={() => setStep((current) => current + 1)}>
            Next
          </Button>
        )}
      </div>
    </Card>
  )
}
