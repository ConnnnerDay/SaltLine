'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './ui'
import type { ResolvedLocation } from '@/app/api/locations/resolve/route'

type Status = 'idle' | 'locating' | 'resolving' | 'error'

/**
 * Sprint 31's device-geolocation sub-item, alongside text search
 * (`LocationSearch`) on `app/locations/locations-search.tsx`. Unlike a
 * text search result -- which shows a confirmation card before
 * navigating, since a query can return several candidates worth
 * comparing -- a geolocation reading resolves to exactly one point,
 * deterministically, so this navigates straight to the resolved
 * forecast rather than adding a confirmation step with nothing to
 * actually confirm.
 *
 * `navigator.geolocation`'s own error codes (`GeolocationPositionError`)
 * are mapped to distinct, readable messages rather than one generic
 * failure string -- a permission denial and a genuinely unavailable
 * position are different problems with different next steps for the
 * visitor (change a browser setting vs. just use text search instead).
 */
export function UseMyLocationButton() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)

    if (!('geolocation' in navigator)) {
      setStatus('error')
      setError('This browser does not support device location.')
      return
    }

    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setStatus('resolving')
        try {
          const response = await fetch('/api/locations/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          })
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            setStatus('error')
            setError(
              response.status === 422
                ? "That location doesn't have nearby coastal data."
                : (body?.error ?? 'Could not resolve your location.'),
            )
            return
          }
          const resolved = (await response.json()) as ResolvedLocation
          router.push(`/forecast/${encodeURIComponent(resolved.id)}`)
        } catch {
          setStatus('error')
          setError('Could not resolve your location.')
        }
      },
      (positionError) => {
        setStatus('error')
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? 'Location access was denied. Allow it in your browser settings, or search instead.'
            : positionError.code === positionError.TIMEOUT
              ? 'Finding your location took too long. Try again, or search instead.'
              : 'Your location is not available right now. Try again, or search instead.',
        )
      },
      { timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const isBusy = status === 'locating' || status === 'resolving'

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={isBusy}
        className="w-full sm:w-auto"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12" />
        </svg>
        {status === 'locating'
          ? 'Finding you…'
          : status === 'resolving'
            ? 'Loading forecast…'
            : 'Use my current location'}
      </Button>
      {error && (
        <p className="text-sm text-danger-text" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
