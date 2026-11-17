'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Field } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import type { Preferences } from '@/app/api/preferences/route'
import { LocationSearch } from '@/app/components/location-search'
import { FISHING_TYPES, type Gear } from '@/lib/profile-options'

const EMPTY: Preferences = {
  units: 'imperial',
  fishing_style: null,
  wind_threshold_kt: null,
  surf_threshold_ft: null,
  default_location_id: null,
  fishing_types: null,
  uses_lures: null,
  uses_live_bait: null,
  uses_cut_bait: null,
  experience: null,
  profile_completed: false,
  target_groups: null,
  fishing_times: null,
  tide_preference: null,
}

const CHOICE =
  'rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
const CHOICE_ON = 'border-primary bg-primary text-primary-contrast'
const CHOICE_OFF = 'border-border bg-transparent text-text-muted hover:border-primary'

function toInputValue(value: number | null): string {
  return value === null ? '' : String(value)
}

function fromInputValue(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function PreferencesForm() {
  const [preferences, setPreferences] = useState<Preferences>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  // Sprint 47 ("Degraded-mode UX"): a failed *load* and a failed *save*
  // used to share one `error` string, rendered as if it were a
  // validation message on the last field ("Default location ID") --
  // actively misleading for a load failure, which has nothing to do
  // with that field, and which left the form silently showing `EMPTY`
  // defaults a user could submit and overwrite their real saved
  // preferences with, with no warning that's what "Save" would do.
  // Split into two distinct states instead: a load failure replaces
  // the whole form with a retryable error state (never renders `EMPTY`
  // as if it were real data), a save failure stays attached to the
  // field it's shown next to, same as before.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [homeName, setHomeName] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setLoadError(null)
    fetch('/api/preferences')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then((data: Preferences) => {
        if (requestId === requestIdRef.current) setPreferences(data)
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setLoadError('Could not load your preferences.')
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaveError(null)
    setSaved(false)
    setIsSaving(true)
    const response = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    })
    setIsSaving(false)
    if (!response.ok) {
      setSaveError('Could not save your preferences.')
      return
    }
    setPreferences(await response.json())
    setSaved(true)
  }

  if (isLoading) return null

  if (loadError) {
    return (
      <Card>
        <p className="text-sm text-danger-text" role="alert">
          {loadError}
        </p>
        <Button type="button" variant="primary" className="mt-3" onClick={load}>
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Units</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Units">
            {(['imperial', 'metric'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={preferences.units === option}
                onClick={() => setPreferences((p) => ({ ...p, units: option }))}
                className={cx(
                  'rounded-md border px-4 py-2 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  preferences.units === option
                    ? 'border-primary bg-primary text-primary-contrast'
                    : 'border-border bg-transparent text-text hover:bg-surface',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="mb-4 flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-text">How you fish</legend>
          <div className="flex flex-wrap gap-2">
            {FISHING_TYPES.map((type) => {
              const selected = preferences.fishing_types?.includes(type.value) ?? false
              return (
                <button
                  key={type.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setPreferences((p) => {
                      const current = p.fishing_types ?? []
                      const next = selected
                        ? current.filter((value) => value !== type.value)
                        : [...current, type.value]
                      return { ...p, fishing_types: next.length ? next : null }
                    })
                  }
                  className={cx(CHOICE, selected ? CHOICE_ON : CHOICE_OFF)}
                >
                  {type.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        {(
          [
            ['uses_lures', 'Lures'],
            ['uses_live_bait', 'Live bait'],
            ['uses_cut_bait', 'Cut bait'],
          ] as const
        ).map(([field, label]) => (
          <fieldset key={field} className="mb-4 flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-text">{label}</legend>
            <div className="flex gap-2">
              {(['yes', 'sometimes', 'no'] as Gear[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={preferences[field] === option}
                  onClick={() =>
                    setPreferences((p) => ({
                      ...p,
                      [field]: p[field] === option ? null : option,
                    }))
                  }
                  className={cx(
                    CHOICE,
                    'capitalize',
                    preferences[field] === option ? CHOICE_ON : CHOICE_OFF,
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
        ))}

        <fieldset className="mb-4 flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-text">Experience</legend>
          <div className="flex flex-wrap gap-2">
            {(['beginner', 'intermediate', 'experienced'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={preferences.experience === option}
                onClick={() =>
                  setPreferences((p) => ({
                    ...p,
                    experience: p.experience === option ? null : option,
                  }))
                }
                className={cx(
                  CHOICE,
                  'capitalize',
                  preferences.experience === option ? CHOICE_ON : CHOICE_OFF,
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          label="Max wind (kt)"
          type="number"
          min={0}
          max={100}
          hint="Days over your limits get flagged and rated a step lower."
          value={toInputValue(preferences.wind_threshold_kt)}
          onChange={(event) =>
            setPreferences((p) => ({
              ...p,
              wind_threshold_kt: fromInputValue(event.target.value),
            }))
          }
        />

        <Field
          label="Max surf (ft)"
          type="number"
          min={0}
          max={60}
          value={toInputValue(preferences.surf_threshold_ft)}
          onChange={(event) =>
            setPreferences((p) => ({
              ...p,
              surf_threshold_ft: fromInputValue(event.target.value),
            }))
          }
        />

        <div className="mb-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Home spot</span>
          <p className="text-sm text-text-muted">
            {homeName ?? preferences.default_location_id ?? 'None yet'} — the forecast
            Saltline opens to.
          </p>
          <LocationSearch
            label="Change home spot"
            onSelect={(location) => {
              setHomeName(`${location.name}, ${location.state}`)
              setPreferences((p) => ({ ...p, default_location_id: location.id }))
            }}
          />
        </div>

        {/* Sprint 47: a save failure is a whole-form outcome (the PATCH
            either applied or it didn't), not a validation error on
            whichever field happens to be last -- shown as its own
            status line instead of Field's per-field error slot. */}
        {saveError && (
          <p className="mb-4 text-sm text-danger-text" role="alert">
            {saveError}
          </p>
        )}
        {saved && !saveError && (
          <p className="mb-4 text-sm text-go-text" role="status">
            Saved.
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save preferences'}
        </Button>
      </form>
    </Card>
  )
}
