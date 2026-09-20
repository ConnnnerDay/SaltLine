'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Field } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import type { Preferences } from '@/app/api/preferences/route'

const EMPTY: Preferences = {
  units: 'imperial',
  fishing_style: null,
  wind_threshold_kt: null,
  surf_threshold_ft: null,
  default_location_id: null,
}

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
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/preferences')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then((data: Preferences) => {
        if (!cancelled) setPreferences(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your preferences.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    setIsSaving(true)
    const response = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    })
    setIsSaving(false)
    if (!response.ok) {
      setError('Could not save your preferences.')
      return
    }
    setPreferences(await response.json())
    setSaved(true)
  }

  if (isLoading) return null

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

        <Field
          label="Fishing style"
          placeholder="e.g. surf, pier, kayak"
          value={preferences.fishing_style ?? ''}
          onChange={(event) =>
            setPreferences((p) => ({ ...p, fishing_style: event.target.value || null }))
          }
        />

        <Field
          label="Max wind (kt)"
          type="number"
          min={0}
          max={100}
          hint="Fish above this and the go/no-go leans against you."
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

        <Field
          label="Default location ID"
          placeholder="e.g. wrightsville-beach-nc"
          hint="A curated location ID from /locations -- a location picker is a follow-up."
          value={preferences.default_location_id ?? ''}
          onChange={(event) =>
            setPreferences((p) => ({
              ...p,
              default_location_id: event.target.value || null,
            }))
          }
          error={error ?? undefined}
        />

        {saved && !error && (
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
