import { requestUnits } from '@/lib/request-units'
import { height, heightRange, speedRange } from '@/lib/units'
import { compassLabel, type ForecastEnvelope } from './forecast-card'
import { Card } from './ui'
import { cx } from './ui/cx'

/**
 * "Wind & waves": how today's wind meets this beach and what the sea is
 * made of, from apps/api's `conditions.wind_effect` (the beach's sea-facing
 * bearing and whether the wind is onshore / offshore / along the shore,
 * from the same per-coast sets the score uses) and `conditions.swell`
 * (the wave trains in the NWS marine text's "Wave Detail").
 *
 * The compass shades the sea side of the beach and draws the wind as an
 * arrow blowing in from its direction; the words beside it say the same.
 */

type WindEffect = {
  orientation: string
  sea_bearing: number | null
  relation: 'onshore' | 'offshore' | 'cross' | null
}

type Swell = { direction: string; height_ft: number; period_s: number }

const BEARING: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
}

const RELATION_TEXT: Record<NonNullable<WindEffect['relation']>, { title: string; body: string }> = {
  onshore: {
    title: 'Onshore wind',
    body: 'Blowing from the sea onto the beach: rougher, murkier surf that pushes bait in close to shore, so fish often feed close too. Harder to hold bottom, so size up your sinker.',
  },
  offshore: {
    title: 'Offshore wind',
    body: 'Blowing from the land out to sea: calmer, cleaner surf. Fish often hold a little deeper, and it helps your casts carry.',
  },
  cross: {
    title: 'Wind along the shore',
    body: 'Blowing along the beach: expect a longshore current that drags lines sideways. Use a heavier sinker and fish the down-current side of structure.',
  },
}

/** A point on the compass circle (radius r) at a compass bearing. */
function at(bearing: number, r: number): [number, number] {
  const radians = (bearing * Math.PI) / 180
  return [60 + r * Math.sin(radians), 60 - r * Math.cos(radians)]
}

function Compass({ windFrom, seaBearing }: { windFrom: number | null; seaBearing: number | null }) {
  // The sea half: a half-disc centered on the bearing the beach faces.
  const sea =
    seaBearing === null
      ? null
      : (() => {
          const [x1, y1] = at(seaBearing - 90, 46)
          const [x2, y2] = at(seaBearing + 90, 46)
          return `M ${x1} ${y1} A 46 46 0 0 1 ${x2} ${y2} Z`
        })()
  const arrow =
    windFrom === null
      ? null
      : (() => {
          // Wind blows FROM windFrom toward the opposite side.
          const [tailX, tailY] = at(windFrom, 40)
          const [headX, headY] = at(windFrom + 180, 22)
          const [leftX, leftY] = at(windFrom + 180 - 22, 12)
          const [rightX, rightY] = at(windFrom + 180 + 22, 12)
          return { tail: `M ${tailX} ${tailY} L ${headX} ${headY}`, head: `M ${leftX} ${leftY} L ${headX} ${headY} L ${rightX} ${rightY}` }
        })()

  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="h-32 w-32 shrink-0">
      <circle cx={60} cy={60} r={46} className="fill-sand/50" />
      {sea && <path d={sea} className="fill-water" />}
      <circle cx={60} cy={60} r={46} fill="none" strokeWidth={1.5} className="stroke-border" />
      {['N', 'E', 'S', 'W'].map((label, index) => {
        const [x, y] = at(index * 90, 55)
        return (
          <text key={label} x={x} y={y + 3.5} textAnchor="middle" className="fill-text-muted text-[10px] font-bold">
            {label}
          </text>
        )
      })}
      {arrow && (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-text">
          <path d={arrow.tail} strokeWidth={4} />
          <path d={arrow.head} strokeWidth={4} />
        </g>
      )}
    </svg>
  )
}

function swellKind(period: number): string {
  if (period >= 10) return 'Long-period groundswell: powerful waves, deeper troughs.'
  if (period >= 7) return 'Swell: steady sets that shape the bars and troughs.'
  return 'Short-period wind chop: choppy and close-spaced.'
}

export function WindAndWaves({ forecast }: { forecast: ForecastEnvelope }) {
  const conditions = (forecast.conditions ?? {}) as {
    wind_effect?: WindEffect | null
    swell?: Swell[]
    wind_direction?: string | null
    wind_range_kt?: [number, number] | null
    wave_range_ft?: [number, number] | null
  }
  const effect = conditions.wind_effect
  const swell = conditions.swell ?? []
  const direction = conditions.wind_direction ? compassLabel(conditions.wind_direction) : null
  const windFrom = direction ? (BEARING[direction] ?? null) : null
  if (!effect && swell.length === 0) return null
  const units = requestUnits()

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="section-label">Wind &amp; waves</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="flex items-start gap-4">
          <Compass windFrom={windFrom} seaBearing={effect?.sea_bearing ?? null} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-lg font-bold text-text">
              {effect?.relation ? RELATION_TEXT[effect.relation].title : 'Wind'}
            </span>
            <span className="text-sm font-semibold tabular-nums text-text">
              {direction ? `From the ${direction}` : 'Direction unknown'}
              {conditions.wind_range_kt && ` · ${speedRange(conditions.wind_range_kt, units)}`}
            </span>
            <p className="text-sm leading-relaxed text-text-muted">
              {effect?.relation
                ? RELATION_TEXT[effect.relation].body
                : effect?.sea_bearing === null
                  ? 'Island shores face every direction, so whether the wind is onshore depends on which side you fish.'
                  : 'No wind direction in today’s forecast.'}
            </p>
            {effect?.sea_bearing != null && (
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-water" /> Sea side of the beach
              </span>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold text-text">
            What the waves are made of
            {conditions.wave_range_ft && (
              <span className="font-normal text-text-muted"> · seas {heightRange(conditions.wave_range_ft, units)}</span>
            )}
          </h3>
          {swell.length === 0 ? (
            <p className="text-sm text-text-muted">The marine forecast doesn’t break today’s waves down.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {swell.map((train) => (
                <li
                  key={`${train.direction}-${train.period_s}-${train.height_ft}`}
                  className="flex items-start gap-3 rounded-md border border-border bg-surface-raised px-3 py-2.5"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-primary">
                    {/* Arrow pointing the way the waves travel (from their direction). */}
                    <g transform={`rotate(${BEARING[train.direction] ?? 0} 12 12)`} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 4v16M6 14l6 6 6-6" />
                    </g>
                  </svg>
                  <span className="flex flex-col gap-0.5 text-sm">
                    <span className="font-semibold tabular-nums text-text">
                      {height(train.height_ft, units, 0)} at {train.period_s} s{' '}
                      <span className="font-normal text-text-muted">from the {train.direction}</span>
                    </span>
                    <span className={cx('text-xs', train.period_s >= 10 ? 'text-marginal-text' : 'text-text-muted')}>
                      {swellKind(train.period_s)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  )
}
