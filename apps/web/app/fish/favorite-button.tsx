'use client'

import { useState } from 'react'
import { cx } from '@/app/components/ui/cx'

/**
 * The Fish guide's star: adds a fish to "My fish" (the profile's
 * `favorite_species`), which lifts it to the top of "What's biting"
 * whenever it's biting where you fish. Optimistic, with a rollback and a
 * message if the save fails.
 */
export function FavoriteButton({ speciesId, initial }: { speciesId: string; initial: string[] }) {
  const [favorites, setFavorites] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const on = favorites.includes(speciesId)

  async function toggle() {
    const before = favorites
    const next = on ? favorites.filter((id) => id !== speciesId) : [...favorites, speciesId]
    setFavorites(next)
    setError(null)
    setSaving(true)
    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite_species: next }),
      })
      if (!response.ok) throw new Error(String(response.status))
    } catch {
      setFavorites(before)
      setError('Couldn’t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={saving}
        aria-pressed={on}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          on ? 'border-accent bg-accent-tint text-accent' : 'border-border text-text hover:border-primary',
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" />
        </svg>
        {on ? 'In My fish' : 'Add to My fish'}
      </button>
      {on && !error && (
        <span className="text-xs text-text-muted">It&apos;ll lead &ldquo;What&apos;s biting&rdquo; whenever it&apos;s biting where you fish.</span>
      )}
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </span>
  )
}
