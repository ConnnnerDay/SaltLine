import { SeasonBadge, StaleLimitsWarning } from '@/app/components/season-badge'
import { formatAsOf } from '@/lib/regulations'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Card, Container } from '@/app/components/ui'
import { cx } from '@/app/components/ui/cx'
import { SpeciesPhotoFigure } from '@/app/components/species-photo'
import { auth } from '@/lib/auth'
import { InternalApiError, internalApiFetch } from '@/lib/internal-api-client'
import type { Preferences } from '@/app/api/preferences/route'
import { ACCESS_LABEL, MONTH_NAMES, REGION_LABEL, TARGET_LABEL, monthSpan, monthsFor, seasonOf, spawningIn, type FishDetail } from '@/lib/fish'
import { localizeText, temp, type Units } from '@/lib/units'
import { monthIn } from '@/lib/zoned-time'
import { FavoriteButton } from '../favorite-button'
import { RigDiagram } from '@/app/components/rig-diagram'
import { RIGS, rigsFor } from '@/lib/rigs'
import { KNOTS, RIG_KNOTS } from '@/lib/knots'
import { setRequestUnits } from '@/lib/request-units'
import { BestSpots } from './best-spots'
import { Identify } from './identify'
import { HookIt } from '@/app/components/hook-it'
import { hooksFor } from '@/lib/hook-bait'
import { RUNS } from '@/lib/runs'
import { sizeText } from '@/lib/size-rule'
import { KeepCheck } from '@/app/components/keep-check'
import { Suspense, cache } from 'react'
import type { Metadata } from 'next'
import type { SavedLocation } from '@/app/api/saved-locations/route'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ speciesId: string }> }

// Request-scoped, so the page title and the page body share one fetch.
const getFish = cache((speciesId: string) =>
  internalApiFetch<FishDetail>(`/v1/species/${encodeURIComponent(speciesId)}`),
)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { speciesId } = await params
  const fish = await getFish(speciesId).catch(() => null)
  return { title: fish ? fish.name : 'Fish guide' }
}

const ACCESS_NOTE: Record<FishDetail['access'], string> = {
  shore: 'Caught from the beach, pier, jetty or bridge.',
  boat: 'Mostly a boat fish: shows up in "What’s biting" if your profile says you fish from a boat.',
  tidal: 'A freshwater fish of coastal rivers and brackish creeks: listed here, never suggested as a pick at a saltwater spot.',
  incidental: 'Bait fish or not a hook-and-line target: listed here, never suggested as a pick.',
  protected:
    'Protected: keeping one is prohibited in federal waters and most states. If you hook one, release it right away. Never suggested as a pick.',
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-sm leading-relaxed text-text">{value}</dd>
    </div>
  )
}

/** Size, bag and season rows, one per state, the home state marked. */
function LimitsTable({
  rows,
  homeState,
  say,
}: {
  rows: FishDetail['regulations']
  homeState: string | null
  say: (text: string) => string
}) {
  if (rows.length === 0) return null
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs text-text-muted">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-semibold">State</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Size</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Bag</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Season</th>
            <th scope="col" className="py-1.5 font-semibold"><span className="sr-only">Source</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rule) => (
            <tr key={rule.state} className={cx('border-t border-border', rule.state === homeState && 'bg-primary-tint')}>
              <th scope="row" className="py-2 pr-3 font-bold text-text">
                {rule.state}
                {rule.state === homeState && <span className="ml-1.5 text-xs font-semibold text-primary">your state</span>}
              </th>
              <td className="py-2 pr-3 text-text">{rule.min_size ? say(sizeText(rule) ?? rule.min_size) : '—'}</td>
              <td className="py-2 pr-3 text-text">{rule.bag_limit ? say(rule.bag_limit) : '—'}</td>
              <td className="py-2 pr-3 text-text-muted">
                {rule.season ? say(rule.season) : 'Open'}
                {rule.season_status && rule.season_status !== 'open' && (
                  <span className="mt-1 block">
                    <SeasonBadge status={rule.season_status} note={rule.season_note} />
                  </span>
                )}
              </td>
              <td className="py-2 text-right">
                {rule.source_url && (
                  <a href={rule.source_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold">
                    Official rules ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One fish from the Fish guide: photo, seasons, how to catch it, and its
 * size and bag limits in every state the snapshot covers. */
export default async function FishDetailPage({ params }: Props) {
  const { speciesId } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect(`/login?next=${encodeURIComponent(`/fish/${speciesId}`)}`)
  const userId = session.user.id

  let fish: FishDetail
  try {
    fish = await getFish(speciesId)
  } catch (err) {
    if (err instanceof InternalApiError && err.status === 404) notFound()
    throw err
  }
  const [prefs, locations, saved, catalogue] = await Promise.all([
    internalApiFetch<Preferences>('/v1/me/preferences', { userId }).catch(() => null),
    internalApiFetch<{ id: string; state: string; conditions_region: string; timezone?: string }[]>('/v1/locations').catch(() => []),
    internalApiFetch<SavedLocation[]>('/v1/me/locations', { userId }).catch(() => [] as SavedLocation[]),
    internalApiFetch<{ id: string; name: string }[]>('/v1/species').catch(() => []),
  ])
  const names = new Map(catalogue.map((entry) => [entry.id, entry.name]))
  const spotIds = [
    ...new Set([prefs?.default_location_id, ...saved.map((spot) => spot.location_id)].filter(Boolean)),
  ] as string[]
  const units: Units = prefs?.units ?? 'imperial'
  setRequestUnits(units)
  // The rigs this fish's setup describes (Rigs & tips' matcher), at most 2.
  const rigIds = rigsFor(`${fish.rig} ${fish.sinker}`).slice(0, 2)
  const say = (text: string) => localizeText(text, units)
  const home = locations.find((spot) => spot.id === prefs?.default_location_id)
  const homeState = home?.state ?? null
  // The season calendar follows the home spot's region when this fish's
  // timing there differs from the catalogue's (regional_seasons.json).
  const seasonRegion = home && fish.season_by_region?.[home.conditions_region] ? home.conditions_region : null
  const months = monthsFor(fish, seasonRegion)
  // The month where the angler is, not on the (UTC) server.
  const month = monthIn(home?.timezone)
  const now = seasonOf(fish, month, seasonRegion)
  const regulations = [...fish.regulations].sort(
    (a, b) => Number(b.state === homeState) - Number(a.state === homeState) || a.state.localeCompare(b.state),
  )
  // The home state's limits up front; every other state folded away.
  // With no home state (or no rule for it), every state is shown.
  const homeRules = regulations.filter((rule) => rule.state === homeState)
  const shownRules = homeRules.length > 0 ? homeRules : regulations
  const otherRules = homeRules.length > 0 ? regulations.filter((rule) => rule.state !== homeState) : []

  return (
    <main>
      <Container>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 py-8 pb-16 sm:py-12">
          <Link href="/fish" className="w-fit text-sm font-semibold no-underline">
            ← Fish guide
          </Link>

          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-bold text-text sm:text-4xl">{fish.name}</h1>
              <FavoriteButton speciesId={fish.id} initial={prefs?.favorite_species ?? []} />
            </div>
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span
                className={cx(
                  'rounded-full px-2.5 py-1 font-bold',
                  now === 'peak' && 'bg-accent-tint text-accent',
                  now === 'good' && 'bg-primary-tint text-primary',
                  now === 'off' && 'bg-border text-text-muted',
                )}
              >
                {now === 'peak' ? `Peak in ${MONTH_NAMES[month - 1]}` : now === 'good' ? `In season in ${MONTH_NAMES[month - 1]}` : `Off season in ${MONTH_NAMES[month - 1]}`}
              </span>
              <span className="rounded-full border border-border px-2.5 py-1 font-semibold text-text-muted">
                {ACCESS_LABEL[fish.access]}
              </span>
              {fish.targets.map((target) => (
                <span key={target} className="rounded-full border border-border px-2.5 py-1 font-semibold text-text-muted">
                  {TARGET_LABEL[target] ?? target}
                </span>
              ))}
            </p>
          </header>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="flex flex-col gap-4">
              <SpeciesPhotoFigure id={fish.id} name={fish.name} compact />
              <Card className="flex flex-col gap-3">
                <h2 className="section-label">Where &amp; when</h2>
                <p className="text-sm text-text">
                  {fish.regions.map((key) => REGION_LABEL[key] ?? key).join(' · ')}
                </p>
                <p className="text-xs text-text-muted">{ACCESS_NOTE[fish.access]}</p>
                {RUNS.some((run) => run.fish.includes(fish.id)) && (
                  <ul className="flex flex-col gap-1.5 text-xs">
                    {RUNS.filter((run) => run.fish.includes(fish.id)).map((run) => (
                      <li key={run.id} className="flex flex-col rounded-md border border-border bg-surface-raised px-2.5 py-1.5">
                        <span className="font-semibold text-text">
                          {run.title}
                          {run.months.includes(month) && <span className="ml-1.5 font-bold text-accent">On now</span>}
                        </span>
                        <span className="text-text-muted">
                          {monthSpan(run.months)} · {run.regions.map((key) => REGION_LABEL[key] ?? key).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div>
                  <div className="grid grid-cols-12 gap-0.5" aria-hidden="true">
                    {MONTH_NAMES.map((name, index) => {
                      const level = seasonOf(fish, index + 1, seasonRegion)
                      return (
                        <span
                          key={name}
                          className={cx(
                            'h-5 rounded-sm',
                            level === 'peak' && 'bg-tier-prime',
                            level === 'good' && 'bg-tier-high',
                            level === 'off' && 'bg-tier-low',
                            index + 1 === month && 'ring-2 ring-text',
                          )}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-1 grid grid-cols-12 text-center text-[0.625rem] text-text-muted" aria-hidden="true">
                    {MONTH_NAMES.map((name) => (
                      <span key={name}>{name[0]}</span>
                    ))}
                  </div>
                  <p className="sr-only">
                    Peak: {months.peak_months.map((m) => MONTH_NAMES[m - 1]).join(', ') || 'none'}. Good:{' '}
                    {months.good_months.map((m) => MONTH_NAMES[m - 1]).join(', ') || 'none'}.
                  </p>
                  <p className="mt-2 flex gap-3 text-xs text-text-muted">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-tier-prime" /> Peak</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-tier-high" /> Good</span>
                    {seasonRegion && <span>Season for the {REGION_LABEL[seasonRegion] ?? seasonRegion}, where your home spot is</span>}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <Fact label="Best water" value={`${temp(fish.temp_ideal_low, units)}–${temp(fish.temp_ideal_high, units)}`} />
                  <Fact label="Found in" value={`${temp(fish.temp_min, units)}–${temp(fish.temp_max, units)}`} />
                </dl>
                {fish.spawn && (
                  <div className="flex flex-col gap-1 border-t border-border pt-3">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                      Spawning
                      <span className="font-normal text-text-muted">
                        {monthSpan(fish.spawn.months)} · {temp(fish.spawn.temp_low, units)}–{temp(fish.spawn.temp_high, units)} water
                      </span>
                      {spawningIn(fish, month) && (
                        <span className="rounded-full bg-marginal-bg px-2 py-0.5 text-xs font-bold text-marginal-text">Spawning now</span>
                      )}
                    </h3>
                    <p className="text-xs leading-relaxed text-text-muted">{say(fish.spawn.note)}</p>
                  </div>
                )}
              </Card>
              <Card className="flex flex-col gap-3">
                <h2 className="section-label">What they&apos;re doing</h2>
                <p className="text-sm leading-relaxed text-text">
                  <span className="font-semibold">Warm water: </span>
                  {say(fish.explanation_warm)}
                </p>
                <p className="text-sm leading-relaxed text-text">
                  <span className="font-semibold">Cool water: </span>
                  {say(fish.explanation_cold)}
                </p>
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              {fish.access === 'protected' ? (
                <Card className="flex flex-col gap-3">
                  <h2 className="section-label">If you hook one</h2>
                  <p className="text-sm leading-relaxed text-text">
                    This fish is protected, so don&apos;t target it. If one takes your bait, keep it in the water,
                    cut the leader close to the hook if you can&apos;t remove it quickly, and let it swim off.
                  </p>
                </Card>
              ) : (
              <Card className="flex flex-col gap-4">
                <h2 className="section-label">How to catch it</h2>
                <dl className="flex flex-col gap-3">
                  <Fact label="Bait" value={say(fish.bait)} />
                  <HookIt hows={hooksFor(fish.bait)} units={units} label="How to hook these baits" />
                  <Fact label="Rig" value={say(fish.rig)} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Fact label="Hook" value={say(fish.hook_size)} />
                    <Fact label="Sinker" value={say(fish.sinker)} />
                  </div>
                  <Fact label="Lures" value={say(fish.lures)} />
                </dl>
              </Card>
              )}
              {rigIds.length > 0 && fish.access !== 'protected' && (
                <Card className="flex flex-col gap-4">
                  <h2 className="section-label">How to rig it</h2>
                  {rigIds.map((rigId) => {
                    const rig = RIGS[rigId]
                    return (
                      <section key={rigId} className="flex flex-col gap-3 border-t border-border pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
                          <div className="rounded-md border border-border bg-bg/60 p-2">
                            <RigDiagram id={rigId} className="h-auto w-full" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h3 className="font-bold text-text">{rig.name}</h3>
                            <p className="text-sm leading-relaxed text-text-muted">{say(rig.summary)}</p>
                            <p className="text-xs text-text-muted">
                              <span className="font-semibold text-text">Line: </span>
                              {say(rig.line.main)}
                              <span className="font-semibold text-text"> · Leader: </span>
                              {say(rig.line.leader)}
                            </p>
                            <p className="text-xs text-text-muted">
                              Knots: {RIG_KNOTS[rigId].map((knot) => KNOTS[knot].name).join(', ')}
                            </p>
                          </div>
                        </div>
                        <details className="group">
                          <summary className="w-fit cursor-pointer text-sm font-semibold text-primary">How to tie it</summary>
                          <ol className="mt-2 flex flex-col gap-1.5 text-sm text-text">
                            {rig.tie.map((step, index) => (
                              <li key={step} className="flex gap-2.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-[0.6875rem] font-bold tabular-nums">
                                  {index + 1}
                                </span>
                                <span className="leading-relaxed">{say(step)}</span>
                              </li>
                            ))}
                          </ol>
                        </details>
                      </section>
                    )
                  })}
                </Card>
              )}
            </div>
          </div>

          {fish.access !== 'incidental' && fish.access !== 'tidal' && fish.access !== 'protected' && (
            <Suspense
              fallback={
                <Card className="flex flex-col gap-2">
                  <h2 className="section-label">Best of your spots today</h2>
                  <p className="text-sm text-text-muted">Checking today&apos;s conditions at your spots…</p>
                </Card>
              }
            >
              <BestSpots
                speciesId={fish.id}
                name={fish.name}
                spotIds={spotIds.slice(0, 12)}
                units={units}
                userId={userId}
              />
            </Suspense>
          )}

          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-label">Size &amp; bag limits</h2>
              {regulations[0] && (
                <span className="text-xs text-text-muted">
                  Snapshot from {formatAsOf(regulations[0].as_of)}. Always check the state&apos;s current rules.
                </span>
              )}
            </div>
            {fish.access === 'protected' && (
              <p className="rounded-md border border-accent/40 bg-accent-tint px-3 py-2 text-sm font-semibold text-text">
                Protected species: no harvest. Keep it in the water and release it right away.
              </p>
            )}
            {regulations.some((rule) => rule.possibly_outdated) && (
              <StaleLimitsWarning asOf={regulations[0].as_of} />
            )}
            {regulations.length > 0 && fish.access !== 'protected' && (
              <KeepCheck
                units={units}
                asOf={formatAsOf(regulations[0].as_of)}
                options={regulations.map((rule) => ({ ...rule, key: rule.state, label: rule.state }))}
              />
            )}
            {regulations.length === 0 ? (
              <p className="text-sm text-text-muted">
                No state limits on file for this fish. Check your state&apos;s fishing regulations.
              </p>
            ) : (
              <>
                <LimitsTable rows={shownRules} homeState={homeState} say={say} />
                {otherRules.length > 0 && (
                  <details className="group">
                    <summary className="w-fit cursor-pointer text-sm font-semibold text-primary">
                      Other states ({otherRules.length})
                    </summary>
                    <div className="mt-2">
                      <LimitsTable rows={otherRules} homeState={homeState} say={say} />
                    </div>
                  </details>
                )}
              </>
            )}
          </Card>

          <Identify id={fish.id} names={names} say={say} beginner={prefs?.experience === 'beginner'} />
        </div>
      </Container>
    </main>
  )
}
