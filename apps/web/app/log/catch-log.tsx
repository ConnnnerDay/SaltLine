'use client'

import { useId, useState, type FormEvent } from 'react'
import { Button, Card } from '@/app/components/ui'
import type { CatchEntry } from '@/app/api/catches/route'
import { formatRange } from '@/app/components/forecast-card'

export type LocationOption = { id: string; label: string }

const INPUT =
  'w-full rounded-md border border-border bg-surface px-3 py-2.5 text-text ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
const LABEL = 'text-sm font-medium text-text'

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local. */
function localNow(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : Number(text)
}

function conditionsLine(entry: CatchEntry): string | null {
  const c = entry.conditions
  if (!c) return null
  const parts: string[] = []
  if (c.verdict) parts.push(c.score !== null ? `${c.verdict} ${c.score}/100` : c.verdict)
  if (c.water_temp_f !== null)
    parts.push(`water ${Math.round(c.water_temp_f)}°F${c.water_temp_is_fallback ? ' (avg)' : ''}`)
  if (c.wind_range_kt)
    parts.push(
      `wind ${c.wind_direction ? `${c.wind_direction} ` : ''}${formatRange(c.wind_range_kt)} kt`,
    )
  if (c.wave_range_ft) parts.push(`waves ${formatRange(c.wave_range_ft, 0.5)} ft`)
  return parts.length ? parts.join(' · ') : null
}

export function CatchLog({
  initialCatches,
  initialError,
  mySpots,
  otherSpots,
  speciesOptions,
  defaultLocationId,
}: {
  initialCatches: CatchEntry[] | null
  initialError: string | null
  mySpots: LocationOption[]
  otherSpots: LocationOption[]
  speciesOptions: string[]
  defaultLocationId: string
}) {
  const [catches, setCatches] = useState<CatchEntry[]>(initialCatches ?? [])
  const [error, setError] = useState<string | null>(initialError)
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const datalistId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/catches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: form.get('location_id'),
          species: String(form.get('species') ?? '').trim(),
          caught_at: new Date(String(form.get('caught_at'))).toISOString(),
          length_in: numberOrNull(form.get('length_in')),
          weight_lb: numberOrNull(form.get('weight_lb')),
          kept: form.get('kept') === 'on',
          bait: String(form.get('bait') ?? '').trim() || null,
          notes: String(form.get('notes') ?? '').trim() || null,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error ?? 'Could not save that catch.')
        return
      }
      setCatches((current) =>
        [body as CatchEntry, ...current].sort((a, b) => b.caught_at.localeCompare(a.caught_at)),
      )
      setFormKey((key) => key + 1)
    } catch {
      setError('Could not save that catch.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    const response = await fetch(`/api/catches/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!response || !response.ok) {
      setError('Could not delete that catch.')
      return
    }
    setCatches((current) => current.filter((entry) => entry.id !== id))
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form key={formKey} onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <h2 className="section-label sm:col-span-2">Log a catch</h2>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={LABEL}>Spot</span>
            <select name="location_id" required defaultValue={defaultLocationId} className={INPUT}>
              {mySpots.length > 0 && (
                <optgroup label="Your spots">
                  {mySpots.map((spot) => (
                    <option key={spot.id} value={spot.id}>
                      {spot.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All spots">
                {otherSpots.map((spot) => (
                  <option key={spot.id} value={spot.id}>
                    {spot.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Species</span>
            <input
              name="species"
              required
              maxLength={80}
              list={datalistId}
              placeholder="e.g. Red drum"
              autoComplete="off"
              className={INPUT}
            />
            <datalist id={datalistId}>
              {speciesOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>When</span>
            <input
              name="caught_at"
              type="datetime-local"
              required
              defaultValue={localNow()}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Length (in, optional)</span>
            <input name="length_in" type="number" min="0.1" max="120" step="0.1" className={INPUT} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Weight (lb, optional)</span>
            <input name="weight_lb" type="number" min="0.1" max="500" step="0.1" className={INPUT} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Bait (optional)</span>
            <input name="bait" maxLength={120} className={INPUT} />
          </label>

          <label className="flex items-center gap-2 self-end pb-2.5">
            <input name="kept" type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" />
            <span className={LABEL}>Kept it</span>
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={LABEL}>Notes (optional)</span>
            <textarea name="notes" maxLength={1000} rows={2} className={INPUT} />
          </label>

          <div className="sm:col-span-2">
            <Button variant="primary" type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Saving…' : 'Log catch'}
            </Button>
          </div>
        </form>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      <section aria-labelledby="log-heading" className="flex flex-col gap-3">
        <h2 id="log-heading" className="section-label">
          Your log ({catches.length})
        </h2>
        {catches.length === 0 ? (
          <p className="text-sm text-text-muted">No catches yet. Your first one goes above.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {catches.map((entry) => {
              const conditions = conditionsLine(entry)
              const size = [
                entry.length_in !== null && `${entry.length_in} in`,
                entry.weight_lb !== null && `${entry.weight_lb} lb`,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={entry.id}>
                  <Card className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-text">
                          {entry.species}
                          {size && <span className="font-normal text-text-muted"> · {size}</span>}
                        </p>
                        <p className="text-sm text-text-muted">
                          {entry.location_name} · {formatter.format(new Date(entry.caught_at))}
                        </p>
                      </div>
                      <span
                        className={
                          'shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ' +
                          (entry.kept
                            ? 'border-marginal-border bg-marginal-bg text-marginal-text'
                            : 'border-go-border bg-go-bg text-go-text')
                        }
                      >
                        {entry.kept ? 'Kept' : 'Released'}
                      </span>
                    </div>
                    {entry.bait && <p className="text-sm text-text">Bait: {entry.bait}</p>}
                    {entry.notes && (
                      <p className="font-serif text-base italic text-text-muted">{entry.notes}</p>
                    )}
                    {conditions && (
                      <p className="text-xs text-text-muted">Conditions: {conditions}</p>
                    )}
                    <div>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="text-xs font-semibold text-danger-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        aria-label={`Delete ${entry.species} catch from ${formatter.format(new Date(entry.caught_at))}`}
                      >
                        Delete
                      </button>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
