'use client'

import { useMemo, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usStates from 'us-atlas/states-10m.json'
import { cx } from './ui/cx'

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
const HEIGHT = 600

// The topology is static, so its GeoJSON is built once.
const topology = usStates as unknown as Topology<{ states: GeometryCollection; nation: GeometryCollection }>
const STATES = feature(topology, topology.objects.states)
const BORDERS = mesh(topology, topology.objects.states, (a, b) => a !== b)

export function SpotMap({
  spots,
  selectedId,
  onSelect,
}: {
  spots: MapSpot[]
  selectedId?: string | null
  onSelect: (spot: MapSpot) => void
}) {
  const [coast, setCoast] = useState('all')
  const [state, setState] = useState<string | null>(null)
  const [hovered, setHovered] = useState<MapSpot | null>(null)
  const coasts = COASTS.filter((c) => c.key === 'all' || spots.some(c.match))
  const onCoast = spots.filter(COASTS.find((c) => c.key === coast)!.match)
  // States on this coast, in coast order (north to south / west to east).
  const states = coast === 'all' ? [] : [...new Set(onCoast.map((spot) => spot.state))]
  const visible = state ? onCoast.filter((spot) => spot.state === state) : onCoast

  const { path, points } = useMemo(() => {
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
      if (xy) points.set(spot.id, xy as [number, number])
    }
    return { path: geoPath(projection), points }
  }, [coast, spots, visible])

  function pickCoast(key: string) {
    setCoast(key)
    setState(null)
  }

  const selected = spots.find((spot) => spot.id === selectedId) ?? null
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
              <span className="text-text-muted">, {label.state}</span>
            </>
          ) : (
            <span className="text-text-muted">Tap a dot to pick a spot</span>
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
          <path d={path(STATES) ?? ''} className="fill-surface" />
          <path d={path(BORDERS) ?? ''} fill="none" strokeWidth={0.8} className="stroke-border" />
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
        </svg>
        {/* Accessible hit targets, laid over the drawn dots. */}
        <div className="relative -mt-[62.5%] pb-[62.5%]">
          {spots.map((spot) => {
            const xy = points.get(spot.id)
            if (!xy || !visible.includes(spot)) return null
            return (
              <button
                key={spot.id}
                type="button"
                aria-label={`${spot.name}, ${spot.state}`}
                aria-pressed={spot.id === selectedId}
                onClick={() => onSelect(spot)}
                onMouseEnter={() => setHovered(spot)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(spot)}
                onBlur={() => setHovered(null)}
                className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                style={{ left: `${(xy[0] / WIDTH) * 100}%`, top: `${(xy[1] / HEIGHT) * 100}%` }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
