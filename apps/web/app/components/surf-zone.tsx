import { requestUnits } from '@/lib/request-units'
import { localizeText } from '@/lib/units'
import type { ForecastEnvelope } from './forecast-card'
import { Card } from './ui'
import { cx } from './ui/cx'

/**
 * "Surf zone": the NWS Surf Zone Forecast for the spot's beach (apps/api's
 * `conditions.weather.surf_zone`, app/providers/surf_zone.py) -- the
 * forecast NWS offices write for people in the water: rip current risk,
 * breaking surf height at the beach (what you see from the sand, unlike
 * offshore seas), headline hazards, UV, water temperature and
 * thunderstorm potential, plus the next days' surf. Not every office
 * issues one (some only in beach season), so the card is simply absent
 * when there's none. Risk is always written out, never color alone.
 */

type SurfPeriod = {
  name: string
  rip_current_risk: string | null
  surf_height: string | null
  thunderstorm: string | null
  uv_index: string | null
  water_temperature: string | null
  weather: string | null
}

type SurfZoneForecast = {
  office: string
  beaches: string | null
  headlines: string[]
  periods: SurfPeriod[]
  extended: { name: string; surf_height: string }[]
}

const RISK_STYLE: Record<string, string> = {
  low: 'border-go-border bg-go-bg text-go-text',
  moderate: 'border-marginal-border bg-marginal-bg text-marginal-text',
  high: 'border-nogo-border bg-nogo-bg text-nogo-text',
}

function riskKey(risk: string | null): string | null {
  const key = risk?.toLowerCase().split(/[ .]/)[0] ?? null
  return key && key in RISK_STYLE ? key : null
}

function RiskBadge({ risk }: { risk: string | null }) {
  const key = riskKey(risk)
  if (!risk || !key) return null
  return (
    <div className={cx('flex items-center gap-3 rounded-md border px-4 py-3', RISK_STYLE[key])}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <path d="M12 20v-6M9 17l3 3 3-3" />
      </svg>
      <div className="flex flex-col">
        <span className="text-xs font-bold uppercase tracking-widest opacity-80">Rip current risk</span>
        <span className="text-xl font-extrabold leading-tight">{risk}</span>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-text">{value}</dd>
    </div>
  )
}

export function SurfZone({ forecast }: { forecast: ForecastEnvelope }) {
  const surf = (forecast.conditions as { weather?: { surf_zone?: SurfZoneForecast | null } | null } | null)
    ?.weather?.surf_zone
  if (!surf || surf.periods.length === 0) return null
  const [today, ...later] = surf.periods
  const risky = ['moderate', 'high'].includes(riskKey(today.rip_current_risk) ?? '')

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Surf zone</h2>
        <span className="text-xs text-text-muted">NWS {surf.office} Surf Zone Forecast</span>
      </div>

      {surf.headlines.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {surf.headlines.map((headline) => (
            <li key={headline} className="rounded-full border border-marginal-border bg-marginal-bg px-3 py-1 text-xs font-semibold text-marginal-text">
              {headline}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="flex flex-col gap-3">
          <RiskBadge risk={today.rip_current_risk} />
          {today.surf_height && (
            <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-raised px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
                Surf at the beach · {today.name.toLowerCase()}
              </span>
              {today.surf_height.split(/\.\s+|;\s+/).map((line) => (
                <span
                  key={line}
                  className={cx(
                    'font-bold leading-snug text-text',
                    /[.;]\s/.test(today.surf_height ?? '') ? 'text-sm' : 'text-lg',
                  )}
                >
                  {line}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Fact label="UV index" value={today.uv_index} />
            <Fact
              label="Water temperature"
              value={
                today.water_temperature
                  ? localizeText(
                      /degree|°/i.test(today.water_temperature)
                        ? today.water_temperature.replace(/\s*degrees?/i, '°F')
                        : `${today.water_temperature}°F`,
                      requestUnits(),
                    )
                  : null
              }
            />
            <Fact label="Thunderstorms" value={today.thunderstorm} />
          </dl>
          {today.weather && <p className="text-sm text-text-muted">{today.weather}.</p>}
          {risky && (
            <p className="rounded-md border-l-4 border-l-nogo-border bg-surface-raised px-3 py-2 text-sm text-text">
              <span className="font-semibold">Caught in a rip current?</span> Don&apos;t fight it: swim
              parallel to the shore until you&apos;re out of the pull, then angle back in. Wade with
              care, and keep clear of the water near jetties and piers.
            </p>
          )}
        </div>
      </div>

      {(later.length > 0 || surf.extended.length > 0) && (
        <ul className="flex flex-wrap gap-2 border-t border-border pt-3">
          {later.map((period) => (
            <li key={period.name} className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm">
              <span className="font-semibold text-text">{period.name}</span>
              <span className="text-text-muted">
                {period.rip_current_risk && ` · rip risk ${period.rip_current_risk.toLowerCase()}`}
                {period.surf_height && ` · surf ${period.surf_height}`}
              </span>
            </li>
          ))}
          {surf.extended.map((day) => (
            <li key={day.name} className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm">
              <span className="font-semibold text-text">{day.name}</span>
              <span className="text-text-muted"> · surf {day.surf_height}</span>
            </li>
          ))}
        </ul>
      )}

      {surf.beaches && <p className="text-xs text-text-muted">Covers the beaches of {surf.beaches}.</p>}
    </Card>
  )
}
