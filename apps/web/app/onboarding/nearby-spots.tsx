'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import { milesBetween, type MapSpot } from '@/app/components/spot-map'
import { distance, type Units } from '@/lib/units'

type Status = 'idle' | 'locating' | 'done' | 'denied' | 'unavailable'

const SHOWN = 4

/**
 * "Find spots near me" for setup's home-spot step: the device's position
 * ranks the listed spots by distance, right here in the browser. The
 * position is used once and never sent or saved (only the spot picked
 * becomes the home spot), unlike a custom map pin, whose id would record
 * the point to ~110 m -- too precise to keep for where someone lives.
 *
 * Asks for location only when tapped, except when the site already has
 * permission (then it runs on its own: no prompt appears). The nearest
 * spot is picked for you when `autoPick` is on (a first-time setup with
 * nothing chosen yet), so this step can be one tap and Next.
 */
export function NearbySpots({
  spots,
  units,
  selectedId,
  autoPick,
  onSelect,
}: {
  spots: MapSpot[]
  units: Units
  selectedId: string | null
  autoPick: boolean
  onSelect: (spot: MapSpot) => void
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [nearest, setNearest] = useState<{ spot: MapSpot; miles: number }[]>([])
  const autoPicked = useRef(false)

  function locate() {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude }
        const ranked = spots
          .map((spot) => ({ spot, miles: milesBetween(here, spot) }))
          .sort((a, b) => a.miles - b.miles)
          .slice(0, SHOWN)
        setNearest(ranked)
        setStatus('done')
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      // Coarse is plenty to rank beaches, and faster and kinder on battery.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    )
  }

  // Pick the nearest once, as soon as both the ranking and the go-ahead
  // (`autoPick`: profile loaded, nothing chosen) are in, in either order.
  useEffect(() => {
    if (autoPick && nearest[0] && !autoPicked.current) {
      autoPicked.current = true
      onSelect(nearest[0].spot)
    }
  }, [autoPick, nearest, onSelect])

  // Already allowed: no prompt will appear, so just do it.
  useEffect(() => {
    let cancelled = false
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permission) => {
        if (!cancelled && permission.state === 'granted') locate()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Once on mount: `locate` only reads `spots`, which doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (spots.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {status !== 'done' && (
        <Button
          type="button"
          variant="primary"
          className="w-full sm:w-fit"
          onClick={locate}
          disabled={status === 'locating'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="7" />
          </svg>
          {status === 'locating' ? 'Finding spots near you…' : 'Find spots near me'}
        </Button>
      )}
      {status === 'idle' && (
        <p className="text-xs text-text-muted">
          Your location only sorts this list, on your device. It isn&apos;t sent or saved.
        </p>
      )}
      {status === 'denied' && (
        <p role="status" className="text-sm text-text-muted">
          No problem: search for your beach or pier below, or tap the map.
        </p>
      )}
      {status === 'unavailable' && (
        <p role="status" className="text-sm text-text-muted">
          Couldn&apos;t get your location right now. Search below, or tap the map.
        </p>
      )}
      {status === 'done' && nearest.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text">Closest to you</p>
          <ul aria-label="Closest spots to you" className="flex flex-col gap-2">
            {nearest.map(({ spot, miles }) => {
              const selected = spot.id === selectedId
              return (
                <li key={spot.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(spot)}
                    className={cx(
                      'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                      selected
                        ? 'border-primary bg-primary-tint font-semibold text-text'
                        : 'border-border bg-surface text-text hover:border-primary',
                    )}
                  >
                    <span>
                      {spot.name}
                      {spot.state ? `, ${spot.state}` : ''}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">{miles < 1 ? `under ${units === 'metric' ? '2 km' : '1 mi'}` : distance(miles, units)} away</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {nearest[0].miles > 150 && (
            <p className="text-xs text-text-muted">
              These are the closest listed spots. For somewhere else on the coast, tap it on the map.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
