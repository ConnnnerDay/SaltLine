'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { milesBetween } from '@/lib/geo'
import { geoAlbersUsa, geoPath, type GeoProjection, type GeoStreamWrapper } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usStates from 'us-atlas/states-10m.json'
import { cx } from './ui/cx'
import { distance, localizeText, type Units } from '@/lib/units'
import type { ResolvedLocation } from '@/app/api/locations/resolve/route'

/**
 * A clickable map of the curated spots, for picking one by where it is
 * rather than by name (the setup wizard's "home spot" step and "Find your
 * spot"). Drawn here -- US states from the us-atlas dataset projected with
 * d3-geo's Albers USA (Hawaii as an inset) -- so there is no map-tile
 * server to depend on and no change to the site's CSP.
 *
 * Coast buttons zoom the view to fit that coast's spots, then state
 * buttons zoom further, so neighboring beaches (often 10-20 miles
 * apart) separate enough to pick. Each spot is a
 * real <button> with a label (keyboard and screen-reader friendly);
 * hovering or focusing one names it, and clicking picks it.
 *
 * Tapping anywhere else drops a pin there and lists the closest spots to
 * it, with distances -- "I fish near here, what's closest?" -- and when
 * the selection changes from outside (a search, a saved home spot) the
 * map zooms to that spot's state so its neighbors are in view. "Fish
 * right at my pin" resolves the pin itself into a spot (apps/api builds a
 * forecast for any coastal point from its nearest NOAA stations), for
 * anglers whose water is between the curated spots.
 */

export type MapSpot = {
  id: string
  name: string
  state: string
  lat: number
  lng: number
  conditions_region?: string
}

const COASTS: { key: string; label: string; match: (spot: MapSpot) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'atlantic', label: 'Atlantic', match: (s) => (s.conditions_region ?? '').startsWith('atlantic') },
  { key: 'gulf', label: 'Gulf', match: (s) => s.conditions_region === 'gulf' },
  { key: 'pacific', label: 'Pacific', match: (s) => (s.conditions_region ?? '').startsWith('pacific') },
  { key: 'hawaii', label: 'Hawaii', match: (s) => (s.conditions_region ?? '').startsWith('hawaii') },
]

const WIDTH = 960
const NEAREST = 4


function coastOf(spot: MapSpot): string {
  return COASTS.find((c) => c.key !== 'all' && c.match(spot))?.key ?? 'all'
}
const HEIGHT = 600

// The topology is static, so its GeoJSON is built once.
const topology = usStates as unknown as Topology<{ states: GeometryCollection; nation: GeometryCollection }>
/**
 * A projection stream that skips points within `min` viewBox units of the
 * last one kept. The dataset is print-map detail; at this map's size
 * (960 units wide, shown at phone width) neighbouring points are often
 * under a pixel apart. Halves the coastline path with no visible change.
 */
function thinned(projection: GeoProjection, min: number): GeoStreamWrapper {
  return {
    stream(sink) {
      let lastX: number | undefined
      let lastY = 0
      return projection.stream({
        point(x, y) {
          if (lastX === undefined || Math.abs(x - lastX) + Math.abs(y - lastY) >= min) {
            sink.point(x, y)
            lastX = x
            lastY = y
          }
        },
        lineStart() {
          lastX = undefined
          sink.lineStart()
        },
        lineEnd: () => sink.lineEnd(),
        polygonStart: () => sink.polygonStart(),
        polygonEnd: () => sink.polygonEnd(),
        sphere: () => sink.sphere?.(),
      })
    },
  }
}

const subscribeNever = () => () => {}

const STATES = feature(topology, topology.objects.states)
const BORDERS = mesh(topology, topology.objects.states, (a, b) => a !== b)

export function SpotMap({
  spots,
  selectedId,
  onSelect,
  units = 'imperial',
}: {
  units?: Units
  spots: MapSpot[]
  selectedId?: string | null
  onSelect: (spot: MapSpot) => void
}) {
  const [coast, setCoast] = useState('all')
  // false while server-rendering and hydrating, true in the browser after.
  const drawLand = useSyncExternalStore(subscribeNever, () => true, () => false)
  const [state, setState] = useState<string | null>(null)
  const [hovered, setHovered] = useState<MapSpot | null>(null)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [pinStatus, setPinStatus] = useState<'idle' | 'resolving' | 'error'>('idle')
  const [pinError, setPinError] = useState<string | null>(null)
  const [custom, setCustom] = useState<MapSpot | null>(null)
  // The selection this map last zoomed for (or picked itself): when the
  // selection changes from outside -- a search, a saved home spot -- the
  // map zooms to that spot's state, so it shows among its neighbors.
  const [zoomedFor, setZoomedFor] = useState<string | null>(null)
  if (selectedId && selectedId !== zoomedFor) {
    const spot = spots.find((s) => s.id === selectedId)
    if (spot) {
      setZoomedFor(selectedId)
      setCoast(coastOf(spot))
      setState(spot.state)
      movePin(null)
    }
  }
  const coasts = COASTS.filter((c) => c.key === 'all' || spots.some(c.match))
  const onCoast = spots.filter(COASTS.find((c) => c.key === coast)!.match)
  // States on this coast, in coast order (north to south / west to east).
  const states = coast === 'all' ? [] : [...new Set(onCoast.map((spot) => spot.state))]
  const visible = state ? onCoast.filter((spot) => spot.state === state) : onCoast

  const { path, points, projection } = useMemo(() => {
    const projection = geoAlbersUsa()
    // Fit the visible spots, each padded by ~0.25 degrees so a state
    // with one spot (or a tight cluster) doesn't zoom in absurdly far.
    const around = visible.flatMap((s) => [
      [s.lng - 0.25, s.lat - 0.25],
      [s.lng + 0.25, s.lat + 0.25],
    ])
    const fitTo =
      coast === 'all'
        ? STATES
        : {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'MultiPoint' as const, coordinates: around },
          }
    const pad = coast === 'all' ? 12 : 48
    projection.fitExtent(
      [
        [pad, pad],
        [WIDTH - pad, HEIGHT - pad],
      ],
      fitTo,
    )
    const points = new Map<string, [number, number]>()
    for (const spot of spots) {
      const xy = projection([spot.lng, spot.lat])
      // Rounded: the server and the browser disagree in the last float
      // digit, which React reports as a hydration mismatch.
      if (xy) points.set(spot.id, [Math.round(xy[0] * 10) / 10, Math.round(xy[1] * 10) / 10])
    }
    return { path: geoPath(thinned(projection, 1)).digits(1), points, projection }
  }, [coast, spots, visible])

  function movePin(next: { lat: number; lng: number } | null) {
    setPin(next)
    setPinStatus('idle')
    setPinError(null)
  }

  function pickCoast(key: string) {
    setCoast(key)
    setState(null)
    movePin(null)
  }

  async function fishAtPin() {
    if (!pin) return
    setPinStatus('resolving')
    setPinError(null)
    try {
      const response = await fetch('/api/locations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: pin.lat, lng: pin.lng }),
      })
      if (!response.ok) {
        setPinStatus('error')
        setPinError(
          response.status === 422
            ? 'No tide or buoy station is close enough to your pin for a forecast. Move it nearer the water, or pick one of the spots above.'
            : 'Couldn’t set up a forecast for your pin right now. Try again, or pick one of the spots above.',
        )
        return
      }
      const resolved = (await response.json()) as ResolvedLocation
      const spot = { id: resolved.id, name: localizeText(resolved.name, units), state: resolved.state, lat: resolved.lat, lng: resolved.lng }
      setCustom(spot)
      setPinStatus('idle')
      pick(spot)
    } catch {
      setPinStatus('error')
      setPinError('Couldn’t set up a forecast for your pin right now. Try again, or pick one of the spots above.')
    }
  }

  function pick(spot: MapSpot) {
    setZoomedFor(spot.id)
    onSelect(spot)
  }

  function dropPin(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    setHovered(null)
    const box = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * WIDTH
    const y = ((event.clientY - box.top) / box.height) * HEIGHT
    const lngLat = projection.invert?.([x, y])
    movePin(lngLat ? { lng: lngLat[0], lat: lngLat[1] } : null)
  }

  const nearest = pin
    ? spots
        .map((spot) => ({ spot, miles: milesBetween(pin, spot) }))
        .sort((a, b) => a.miles - b.miles)
        .slice(0, NEAREST)
    : []
  const pinXY = pin ? projection([pin.lng, pin.lat]) : null

  const selected =
    spots.find((spot) => spot.id === selectedId) ?? (custom?.id === selectedId ? custom : null)
  const label = hovered ?? selected

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zoom the map to a coast">
        {coasts.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={coast === c.key}
            onClick={() => pickCoast(c.key)}
            className={cx(
              'rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              coast === c.key
                ? 'border-primary bg-primary text-primary-contrast'
                : 'border-border text-text-muted hover:border-primary hover:text-text',
            )}
          >
            {c.label}
          </button>
        ))}
        <span className="ml-auto min-h-5 text-sm" aria-live="polite">
          {label ? (
            <>
              <span className="font-semibold text-text">{label.name}</span>
              {label.state && <span className="text-text-muted">, {label.state}</span>}
            </>
          ) : (
            <span className="text-text-muted">Tap a dot, or anywhere to find the closest</span>
          )}
        </span>
      </div>

      {states.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zoom to a state">
          <span className="text-xs text-text-muted">Zoom to:</span>
          {states.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={state === code}
              onClick={() => setState(state === code ? null : code)}
              className={cx(
                'rounded-md border px-2 py-0.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                state === code
                  ? 'border-primary bg-primary text-primary-contrast'
                  : 'border-border text-text-muted hover:border-primary hover:text-text',
              )}
            >
              {code}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-water">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full">
          <title>Map of Saltline&apos;s fishing spots</title>
          {/* Land is drawn in the browser, after load: ~250 KB of path
              data would otherwise sit in every setup/Find-a-spot page's
              HTML. The frame (viewBox) and the spot dots are there from
              the start, so nothing shifts when it appears. */}
          {drawLand && (
            <>
              <path d={path(STATES) ?? ''} className="fill-surface" />
              <path d={path(BORDERS) ?? ''} fill="none" strokeWidth={0.8} className="stroke-border" />
            </>
          )}
          {spots.map((spot) => {
            const xy = points.get(spot.id)
            if (!xy || !visible.includes(spot)) return null
            const isSelected = spot.id === selectedId
            const r = coast === 'all' ? 6 : state ? 11 : 8
            return (
              <g key={spot.id}>
                <circle cx={xy[0]} cy={xy[1]} r={r + 10} fill="transparent" />
                <circle
                  cx={xy[0]}
                  cy={xy[1]}
                  r={isSelected ? r + 3 : r}
                  strokeWidth={2.5}
                  className={cx(
                    'pointer-events-none transition-[r]',
                    isSelected ? 'fill-accent stroke-white' : 'fill-primary stroke-surface',
                    hovered?.id === spot.id && !isSelected && 'fill-primary-hover',
                  )}
                />
              </g>
            )
          })}
          {pinXY && (
            <g className="pointer-events-none" transform={`translate(${pinXY[0]} ${pinXY[1]})`}>
              {/* A map pin whose point sits on the tapped spot. */}
              <path
                d="M0 0 C -4 -10 -14 -16 -14 -26 A 14 14 0 1 1 14 -26 C 14 -16 4 -10 0 0 Z"
                strokeWidth={2.5}
                className="fill-text stroke-surface"
              />
              <circle cy={-26} r={5} className="fill-surface" />
            </g>
          )}
        </svg>
        {/* Accessible hit targets, laid over the drawn dots. */}
        <div className="relative -mt-[62.5%] cursor-crosshair pb-[62.5%]" onClick={dropPin} onMouseLeave={() => setHovered(null)}>
          {spots.map((spot) => {
            const xy = points.get(spot.id)
            if (!xy || !visible.includes(spot)) return null
            return (
              <button
                key={spot.id}
                type="button"
                aria-label={`${spot.name}, ${spot.state}`}
                aria-pressed={spot.id === selectedId}
                onClick={() => pick(spot)}
                onMouseEnter={() => setHovered(spot)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(spot)}
                onBlur={() => setHovered(null)}
                className="absolute h-7 w-7 cursor-pointer -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                style={{ left: `${(xy[0] / WIDTH) * 100}%`, top: `${(xy[1] / HEIGHT) * 100}%` }}
              />
            )
          })}
        </div>
      </div>

      {nearest.length > 0 && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">Closest spots to your pin</h3>
            <button
              type="button"
              onClick={() => movePin(null)}
              className="text-xs font-semibold text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Clear pin
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {nearest.map(({ spot, miles }) => (
              <li key={spot.id}>
                <button
                  type="button"
                  aria-pressed={spot.id === selectedId}
                  onClick={() => pick(spot)}
                  onMouseEnter={() => setHovered(spot)}
                  onMouseLeave={() => setHovered(null)}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    spot.id === selectedId
                      ? 'border-accent bg-surface-raised'
                      : 'border-border bg-surface hover:border-primary',
                  )}
                >
                  <span className="min-w-0">
                    <span className="font-semibold text-text">{spot.name}</span>
                    <span className="text-text-muted">, {spot.state}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">
                    {distance(miles, units)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => void fishAtPin()}
              disabled={pinStatus === 'resolving'}
              aria-pressed={!!custom && custom.id === selectedId}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              {pinStatus === 'resolving'
                ? 'Finding the nearest stations…'
                : custom && custom.id === selectedId
                  ? `Using your pin: ${custom.name}`
                  : 'Fish right at my pin'}
            </button>
            <span className="text-xs text-text-muted">
              Uses the NOAA tide and buoy stations nearest your pin.
            </span>
          </div>
          {pinError && (
            <p role="alert" className="text-sm text-danger-text">
              {pinError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
