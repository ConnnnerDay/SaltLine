'use client'

import { useState } from 'react'
import { Button } from './ui'

/**
 * Sprint 37's one piece of UI on the forecast page itself. The page
 * already loads the visitor's saved spots, so `initiallySaved` starts it
 * as "Saved" for a spot that's on the list (it used to say "Save this
 * spot" until clicked). A click always ends in "Saved", whether this
 * click saved it or apps/api's 409 says it already was.
 */
export function SaveLocationButton({
  locationId,
  initiallySaved = false,
  compact = false,
}: {
  locationId: string
  initiallySaved?: boolean
  /** A small bookmark button for the navy location bar. */
  compact?: boolean
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(initiallySaved ? 'saved' : 'idle')

  async function handleClick() {
    setStatus('saving')
    const response = await fetch('/api/saved-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: locationId }),
    })
    // 201 (just saved) and 409 (already saved) both mean the same
    // thing from here: this location is on the visitor's saved list.
    if (response.ok || response.status === 409) {
      setStatus('saved')
      return
    }
    setStatus('error')
  }

  if (compact) {
    const saved = status === 'saved'
    return (
      <button
        type="button"
        onClick={saved ? undefined : handleClick}
        disabled={saved || status === 'saving'}
        aria-label={saved ? 'Saved to your spots' : 'Save this spot'}
        className="flex h-8 items-center gap-1.5 rounded-md border border-white/20 px-2.5 text-xs font-semibold text-white/85 hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-default disabled:hover:border-white/20"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" />
        </svg>
        {status === 'error' ? 'Try again' : saved ? 'Saved' : status === 'saving' ? 'Saving…' : 'Save'}
      </button>
    )
  }

  if (status === 'saved') {
    return (
      <Button variant="secondary" disabled className="w-full sm:w-auto">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 13 L10 18 L20 6" />
        </svg>
        Saved
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={handleClick}
        disabled={status === 'saving'}
      >
        {status === 'saving' ? 'Saving…' : 'Save this spot'}
      </Button>
      {status === 'error' && (
        <p className="text-sm text-danger-text" role="alert">
          Could not save this location.
        </p>
      )}
    </div>
  )
}
