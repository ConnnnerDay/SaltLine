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
}: {
  locationId: string
  initiallySaved?: boolean
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
