'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Field } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import type { Preferences } from '@/app/api/preferences/route'
import { LocationSearch } from '@/app/components/location-search'
import {
  FISHING_TIMES,
  FISHING_TYPES,
  TARGET_GROUPS,
  TIDE_PREFERENCES,
  type Gear,
} from '@/lib/profile-options'

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
  'min-h-10 rounded-md border px-3.5 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
const CHOICE_ON = 'border-primary bg-primary text-primary-contrast'
const CHOICE_OFF = 'border-border bg-transparent text-text-muted hover:border-primary hover:text-text'

/** One titled block of the form; blocks are separated by hairlines. */
function Group({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border py-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h2 className="section-label text-text!">{title}</h2>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** A labeled row of toggle chips (multi- or single-select). */
function Chips({
  label,
  options,
  isOn,
  onToggle,
}: {
  label: string
  options: { value: string; label: string }[]
  isOn: (value: string) => boolean
  onToggle: (value: string) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-text">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={isOn(option.value)}
            onClick={() => onToggle(option.value)}
            className={cx(CHOICE, isOn(option.value) ? CHOICE_ON : CHOICE_OFF)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function toggleIn(list: string[] | null, value: string): string[] | null {
  const current = list ?? []
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
  return next.length ? next : null
}

const GEAR_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'no', label: 'No' },
]

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'experienced', label: 'Experienced' },
]

function toInputValue(value: number | null): string {
  return value === null ? '' : String(value)
}

function fromInputValue(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function PreferencesForm({
  locationNames = {},
}: {
  /** Curated location id -> "Name, ST", to show the home spot by name. */
  locationNames?: Record<string, string>
}) {
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

  const currentHome = homeName ?? (preferences.default_location_id ? (locationNames[preferences.default_location_id] ?? 'A custom spot') : null)

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col">
        <Group title="Home spot" description="The forecast Saltline opens to.">
          <p className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3.5 py-3 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-primary">
              <circle cx="12" cy="10" r="3" />
              <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.1 11.5 7.4 11.8a1 1 0 0 0 1.2 0C12.9 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" />
            </svg>
            <span className={currentHome ? 'font-semibold text-text' : 'text-text-muted'}>
              {currentHome ?? 'None yet'}
            </span>
          </p>
          <LocationSearch
            label="Change home spot"
            onSelect={(location) => {
              setHomeName(`${location.name}, ${location.state}`)
              setPreferences((p) => ({ ...p, default_location_id: location.id }))
            }}
          />
        </Group>

        <Group title="How you fish">
          <Chips
            label="Where"
            options={FISHING_TYPES}
            isOn={(value) => preferences.fishing_types?.includes(value) ?? false}
            onToggle={(value) =>
              setPreferences((p) => ({ ...p, fishing_types: toggleIn(p.fishing_types, value) }))
            }
          />
          <Chips
            label="Mostly fishing for"
            options={TARGET_GROUPS}
            isOn={(value) => preferences.target_groups?.includes(value) ?? false}
            onToggle={(value) =>
              setPreferences((p) => ({ ...p, target_groups: toggleIn(p.target_groups, value) }))
            }
          />
          <Chips
            label="Experience"
            options={EXPERIENCE_OPTIONS}
            isOn={(value) => preferences.experience === value}
            onToggle={(value) =>
              setPreferences((p) => ({
                ...p,
                experience:
                  p.experience === value ? null : (value as Preferences['experience']),
              }))
            }
          />
        </Group>

        <Group title="When you fish" description="Your forecast shows the best window inside these times.">
          <Chips
            label="Usual times"
            options={FISHING_TIMES}
            isOn={(value) => preferences.fishing_times?.includes(value) ?? false}
            onToggle={(value) =>
              setPreferences((p) => ({ ...p, fishing_times: toggleIn(p.fishing_times, value) }))
            }
          />
          <Chips
            label="Preferred tide"
            options={TIDE_PREFERENCES}
            isOn={(value) => preferences.tide_preference === value}
            onToggle={(value) =>
              setPreferences((p) => ({
                ...p,
                tide_preference:
                  p.tide_preference === value
                    ? null
                    : (value as Preferences['tide_preference']),
              }))
            }
          />
        </Group>

        <Group title="Gear" description="Pack for today skips what you never use.">
          {(
            [
              ['uses_lures', 'Lures'],
              ['uses_live_bait', 'Live bait'],
              ['uses_cut_bait', 'Cut bait'],
            ] as const
          ).map(([field, label]) => (
            <Chips
              key={field}
              label={label}
              options={GEAR_OPTIONS}
              isOn={(value) => preferences[field] === value}
              onToggle={(value) =>
                setPreferences((p) => ({
                  ...p,
                  [field]: p[field] === value ? null : (value as Gear),
                }))
              }
            />
          ))}
        </Group>

        <Group
          title="Comfort limits"
          description="Days over your limits get flagged and rated a step lower."
        >
          <div className="grid grid-cols-2 gap-3 [&>div]:mb-0">
            <Field
              label="Max wind (kt)"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
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
              inputMode="decimal"
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
          </div>
        </Group>

        <Group title="Units">
          <div className="flex gap-2" role="radiogroup" aria-label="Units">
            {(['imperial', 'metric'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={preferences.units === option}
                onClick={() => setPreferences((p) => ({ ...p, units: option }))}
                className={cx(
                  CHOICE,
                  'capitalize',
                  preferences.units === option ? CHOICE_ON : CHOICE_OFF,
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </Group>

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

        <Button type="submit" variant="primary" className="mt-2 w-full" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save preferences'}
        </Button>
      </form>
    </Card>
  )
}
