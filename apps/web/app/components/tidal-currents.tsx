import { requestUnits } from '@/lib/request-units'
import { currentSpeed } from '@/lib/units'
import { compassLabel, type ForecastEnvelope } from './forecast-card'

type CurrentEvent = { time: string; kind: 'slack' | 'flood' | 'ebb'; speed_kt: number; direction_deg: number | null }
type Currents = { station_name: string; distance_miles: number; events: CurrentEvent[] }

/**
 * "Tidal current" at the top of Tides: the next slack and max-flood/
 * max-ebb times from the nearest NOAA current station (within a few
 * miles; apps/api leaves `conditions.currents` out otherwise). What bridge,
 * inlet and jetty anglers time their fishing by.
 */
export function TidalCurrents({ forecast, now = new Date() }: { forecast: ForecastEnvelope; now?: Date }) {
  const currents = (forecast.conditions as { currents?: Currents | null } | null)?.currents
  if (!currents) return null
  const upcoming = currents.events.filter((event) => new Date(event.time) >= now).slice(0, 4)
  if (upcoming.length === 0) return null
  const zone = forecast.location.timezone
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const units = requestUnits()

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="section-label">Tidal current</h3>
        <span className="text-xs text-text-muted">
          {currents.station_name}, {currents.distance_miles < 1 ? 'under a mile' : `${currents.distance_miles} mi`} away
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
        {upcoming.map((event) => (
          <li key={event.time} className="flex items-baseline justify-between gap-3 rounded border border-border px-2.5 py-1.5">
            <span className="font-semibold text-text">
              {event.kind === 'slack' ? 'Slack' : event.kind === 'flood' ? 'Max flood' : 'Max ebb'}
              {event.kind !== 'slack' && (
                <span className="font-normal text-text-muted">
                  {' '}
                  {currentSpeed(event.speed_kt, units)}
                  {event.direction_deg !== null && ` toward ${compassLabel(String(event.direction_deg))}`}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap tabular-nums text-text-muted">{clock.format(new Date(event.time))}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">
        Fish feed hardest when the current runs; slack water is the easy window to get a bait down.
      </p>
    </section>
  )
}
