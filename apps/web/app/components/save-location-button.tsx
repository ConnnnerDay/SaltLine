'use client'

import { useState } from 'react'
import { Button } from './ui'

/**
 * Sprint 37's one piece of UI on the forecast page itself. Deliberately
 * doesn't check on page load whether this location is already saved
 * (that would need an extra apps/api round trip just to render a
 * button correctly, for a property that rarely changes) -- instead,
 * a click always ends in "Saved" state, whether this click is what
 * saved it or apps/api's 409 says it already was: from the visitor's
 * side, the location being saved is what they wanted, not which of the
 * two happened. The one real cost is the initial render can say "Save
 * this spot" for an already-saved location until clicked; a real
 * indicator is a follow-up, not attempted here.
 */
export function SaveLocationButton({ locationId }: { locationId: string }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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
